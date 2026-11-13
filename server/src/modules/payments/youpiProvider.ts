import crypto from 'crypto';
import { PaymentMethod, PaymentStatus, ApiErrorCode } from '@shopright/shared-types';
import { PaymentProvider, PaymentInitiationResult } from './types.js';
import { AppError } from '../../middleware/errorHandler.js';
import { config } from '../../config/env.js';

/** Augmented result for UPI_QR payments — adds YouPI-specific fields */
export interface YoupiPaymentResult extends PaymentInitiationResult {
  checkoutUrl?: string;
  expiresAt?: Date;
}

/** Shape of the YouPI POST /api/v1/payments response */
interface YoupiCreateSessionResponse {
  id: string;
  checkoutUrl: string;
  expiresAt: string; // ISO 8601
}

/** Shape of the YouPI GET /api/v1/payments/:id response */
interface YoupiGetSessionResponse {
  id: string;
  status: string;
  orderId: string;
  utrRef?: string;
}

/** Verify HMAC-SHA256 signature from YouPI webhook (timing-safe) */
export function verifyYoupiWebhookSignature(rawBody: Buffer, signature: string): boolean {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signature.slice('sha256='.length);
  const expected = crypto
    .createHmac('sha256', config.YOUPI_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  try {
    const expectedBuf = Buffer.from(expected, 'hex');
    const receivedBuf = Buffer.from(receivedHex, 'hex');

    if (expectedBuf.length !== receivedBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}

/** Returns true if dev/test mode — avoids real HTTP calls */
function isDevMode(): boolean {
  return config.NODE_ENV === 'test' || config.YOUPI_API_KEY === 'dev_youpi_api_key';
}

export class YoupiProvider implements PaymentProvider {
  public readonly method = PaymentMethod.UPI_QR;

  async createPayment(orderId: string, amountPaise: number): Promise<YoupiPaymentResult> {
    // Dev/test mode: return a mock session without making a real HTTP call
    if (isDevMode()) {
      const mockSessionId = `mock-session-${orderId.slice(0, 8)}`;
      return {
        status: PaymentStatus.PENDING,
        providerRef: mockSessionId,
        checkoutUrl: `https://pay.dev.local/checkout/${mockSessionId}`,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
      };
    }

    let response: Response;
    try {
      response = await fetch(`${config.YOUPI_API_URL}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.YOUPI_API_KEY,
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          orderId,
          customerDetails: {
            name: 'Customer',
            email: 'customer@shopright.app',
            phone: '0000000000',
          },
        }),
      });
    } catch (err) {
      throw new AppError(
        502,
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'YouPI payment gateway is unreachable. Please try again later.',
        err instanceof Error ? err.message : String(err)
      );
    }

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text().catch(() => '');
      }
      throw new AppError(
        502,
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        `YouPI API returned an error: ${response.status} ${response.statusText}`,
        body
      );
    }

    let data: YoupiCreateSessionResponse;
    try {
      data = (await response.json()) as YoupiCreateSessionResponse;
    } catch {
      throw new AppError(
        502,
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'YouPI API returned an invalid response body.'
      );
    }

    return {
      status: PaymentStatus.PENDING,
      providerRef: data.id,
      checkoutUrl: data.checkoutUrl,
      expiresAt: new Date(data.expiresAt),
    };
  }

  async verifyPayment(_orderId: string, payload?: unknown): Promise<boolean> {
    const youpiPaymentId = typeof payload === 'string' ? payload : undefined;
    if (!youpiPaymentId) {
      return false;
    }

    if (isDevMode()) {
      // In dev/test mode, treat any non-empty providerRef as verified
      return true;
    }

    let response: Response;
    try {
      response = await fetch(`${config.YOUPI_API_URL}/api/v1/payments/${youpiPaymentId}`, {
        headers: { 'x-api-key': config.YOUPI_API_KEY },
      });
    } catch (err) {
      throw new AppError(
        502,
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'YouPI payment gateway is unreachable during verification.',
        err instanceof Error ? err.message : String(err)
      );
    }

    if (!response.ok) {
      return false;
    }

    let data: YoupiGetSessionResponse;
    try {
      data = (await response.json()) as YoupiGetSessionResponse;
    } catch {
      return false;
    }

    return data.status === 'OBSERVED_SUCCESS' || data.status === 'RECONCILED';
  }
}

/** Singleton instance */
export const youpiProvider = new YoupiProvider();
