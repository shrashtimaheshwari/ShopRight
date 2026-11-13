import { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentMethod, PaymentStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { getPaymentProvider } from './index.js';
import { verifyYoupiWebhookSignature, YoupiPaymentResult } from './youpiProvider.js';
import { emitOrderStatusChanged } from '../realtime/socketServer.js';

// ─── Request Schemas ───────────────────────────────────────────────────────────

const initiatePaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
});

const youpiWebhookEventSchema = z.object({
  event: z.enum([
    'payment.observed_success',
    'payment.reconciled',
    'payment.failed',
    'payment.expired',
  ]),
  data: z.object({
    paymentId: z.string(),
    orderId: z.string(),
    amount: z.number(),
    utrRef: z.string().optional(),
    status: z.string(),
  }),
});

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * POST /orders/:id/pay
 * Initiates or updates a payment for an order.
 * Auth: CUSTOMER only, must own the order.
 */
export async function initiatePaymentHandler(req: Request, res: Response): Promise<void> {
  const customerId = req.user?.sub;
  if (!customerId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const { id: orderId } = req.params;

  const parseResult = initiatePaymentSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid payment payload.',
      parseResult.error.format()
    );
  }

  const { method } = parseResult.data;

  // Fetch order with payment
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });

  if (!order) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  }

  // Ownership check: only the customer who placed the order
  if (order.customerId !== customerId) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_RESOURCE,
      'You do not have permission to pay for this order.'
    );
  }

  // Prevent re-payment of already-completed orders
  if (order.payment?.status === PaymentStatus.COMPLETED) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'This order has already been paid.'
    );
  }

  // Invoke the provider
  const provider = getPaymentProvider(method);
  const result = await provider.createPayment(orderId, order.total);

  // Build update data based on method
  let updateData: {
    method: PaymentMethod;
    status: PaymentStatus;
    providerRef?: string | null;
    checkoutUrl?: string | null;
    expiresAt?: Date | null;
  };

  if (method === PaymentMethod.UPI_QR) {
    const youpiResult = result as YoupiPaymentResult;
    updateData = {
      method,
      status: result.status,
      providerRef: result.providerRef ?? null,
      checkoutUrl: youpiResult.checkoutUrl ?? null,
      expiresAt: youpiResult.expiresAt ?? null,
    };
  } else {
    updateData = {
      method,
      status: result.status,
      providerRef: result.providerRef ?? null,
    };
  }

  // Upsert payment record
  const payment = await prisma.payment.upsert({
    where: { orderId },
    create: { orderId, ...updateData },
    update: updateData,
  });

  res.status(200).json({ success: true, data: payment });
}

/**
 * POST /payments/webhook/youpi
 * Receives YouPI payment gateway webhooks.
 * No auth — validated via HMAC-SHA256 signature.
 * Must receive raw body (express.raw middleware applied in app.ts).
 */
export async function youpiWebhookHandler(req: Request, res: Response): Promise<void> {
  // rawBody is the Buffer set by express.raw({ type: 'application/json' })
  const rawBody = req.body as Buffer;
  const signature = req.headers['x-youpi-signature'] as string | undefined;

  if (!signature || !verifyYoupiWebhookSignature(rawBody, signature)) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid webhook signature.' } });
    return;
  }

  // Parse and validate payload
  let parsed: z.infer<typeof youpiWebhookEventSchema>;
  try {
    const bodyJson: unknown = JSON.parse(rawBody.toString('utf-8'));
    const parseResult = youpiWebhookEventSchema.safeParse(bodyJson);
    if (!parseResult.success) {
      console.warn('[YouPI Webhook] Invalid event shape:', parseResult.error.format());
      // Acknowledge to prevent retries for malformed events
      res.status(200).json({ received: true });
      return;
    }
    parsed = parseResult.data;
  } catch (err) {
    console.warn('[YouPI Webhook] Failed to parse body:', err);
    res.status(200).json({ received: true });
    return;
  }

  const { event, data } = parsed;

  // Find payment by providerRef (youpiPaymentId)
  const payment = await prisma.payment.findFirst({
    where: { providerRef: data.paymentId },
    include: { order: { select: { shopId: true, updatedAt: true } } },
  });

  if (!payment) {
    // Log and gracefully acknowledge — YouPI should not retry for unknown IDs
    console.warn(`[YouPI Webhook] No payment found for providerRef=${data.paymentId}, event=${event}`);
    res.status(200).json({ received: true });
    return;
  }

  switch (event) {
    case 'payment.reconciled': {
      // Atomically update payment status and emit socket event
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.COMPLETED },
        });
      });

      // Emit real-time event after transaction commits
      emitOrderStatusChanged({
        orderId: payment.orderId,
        shopId: payment.order.shopId,
        status: PaymentStatus.COMPLETED,
        updatedAt: new Date(),
      });

      console.info(`[YouPI Webhook] payment.reconciled — orderId=${payment.orderId} → COMPLETED`);
      break;
    }

    case 'payment.observed_success': {
      // Bank credit seen but not yet reconciled — keep status PENDING, log only
      console.info(`[YouPI Webhook] payment.observed_success — orderId=${payment.orderId}, status stays PENDING`);
      break;
    }

    case 'payment.failed':
    case 'payment.expired': {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });
      console.info(`[YouPI Webhook] ${event} — orderId=${payment.orderId} → FAILED`);
      break;
    }

    default: {
      console.warn(`[YouPI Webhook] Unhandled event: ${event}`);
      break;
    }
  }

  // Always respond 200 to YouPI
  res.status(200).json({ received: true });
}
