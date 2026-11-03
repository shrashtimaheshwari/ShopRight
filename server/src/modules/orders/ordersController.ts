import { Request, Response } from 'express';
import { z } from 'zod';
import { Role, OrderStatus, ShopStatus, PaymentMethod, PaymentStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { calculateOrderPricing } from '../pricing/index.js';
import { executeOrderTransition } from '../../stateMachine/orderStateMachine.js';

// Strict schema forbidding any client-sent price, subtotal, delivery fee, or total (Security Doc §3)
const createOrderItemSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  quantity: z.number().int().positive('Quantity must be a positive integer'),
});

const createOrderSchema = z
  .object({
    shopId: z.string().min(1, 'Shop ID is required'),
    deliveryAddressId: z.string().min(1, 'Delivery address ID is required'),
    items: z.array(createOrderItemSchema).min(1, 'At least one item is required'),
    idempotencyKey: z.string().optional(),
    // Explicitly reject price tampering attempts
    price: z.undefined({ message: 'Client-provided price is forbidden' }),
    subtotal: z.undefined({ message: 'Client-provided subtotal is forbidden' }),
    deliveryFee: z.undefined({ message: 'Client-provided deliveryFee is forbidden' }),
    total: z.undefined({ message: 'Client-provided total is forbidden' }),
  })
  .strict();

const createRatingSchema = z.object({
  stars: z.number().int().min(1).max(5, 'Stars must be between 1 and 5'),
  comment: z.string().optional(),
});

export async function createOrderHandler(req: Request, res: Response): Promise<void> {
  const customerId = req.user?.sub;
  if (!customerId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const parseResult = createOrderSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid order payload. Client cannot provide prices or totals.',
      parseResult.error.format()
    );
  }

  const { shopId, deliveryAddressId, items, idempotencyKey } = parseResult.data;

  // 1. Idempotency check (Security Doc §3)
  if (idempotencyKey) {
    const existingOrder = await prisma.order.findFirst({
      where: { customerId, idempotencyKey },
      include: {
        items: { include: { product: true } },
        shop: true,
        deliveryAddress: true,
        payment: true,
      },
    });

    if (existingOrder) {
      res.status(200).json({
        success: true,
        data: existingOrder,
      });
      return;
    }
  }

  // 2. Fetch and validate delivery address
  const deliveryAddress = await prisma.address.findUnique({
    where: { id: deliveryAddressId },
  });

  if (!deliveryAddress || deliveryAddress.userId !== customerId) {
    throw new AppError(
      404,
      ApiErrorCode.NOT_FOUND,
      'Delivery address not found or does not belong to you.'
    );
  }

  // 3. Fetch and validate shop
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');
  }

  // 4. Fetch DB products for all requested items
  const productIds = items.map((i) => i.productId);
  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  // 5. Fetch active delivery fee rule (or seed fallback if none exists)
  let activeFeeRule = await prisma.deliveryFeeRule.findFirst({
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!activeFeeRule) {
    activeFeeRule = await prisma.deliveryFeeRule.create({
      data: {
        baseFee: 3000,               // ₹30.00
        perKmFee: 1000,              // ₹10.00 per km
        freeDeliveryThreshold: 50000, // Free above ₹500.00
      },
    });
  }

  // 6. Calculate Server-Authoritative Pricing (recalculates serviceability, inventory, fee, total)
  const pricingResult = calculateOrderPricing({
    shop: {
      id: shop.id,
      lat: shop.lat,
      lng: shop.lng,
      serviceRadiusKm: shop.serviceRadiusKm,
      status: shop.status as unknown as ShopStatus,
    },
    customerLocation: { lat: deliveryAddress.lat, lng: deliveryAddress.lng },
    items,
    dbProducts,
    activeFeeRule: {
      baseFee: activeFeeRule.baseFee,
      perKmFee: activeFeeRule.perKmFee,
      freeDeliveryThreshold: activeFeeRule.freeDeliveryThreshold,
    },
  });

  // 7. Atomic Order Persistence
  const createdOrder = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        customerId,
        shopId: shop.id,
        deliveryAddressId: deliveryAddress.id,
        status: OrderStatus.PLACED,
        subtotal: pricingResult.subtotal,
        deliveryFee: pricingResult.deliveryFee,
        total: pricingResult.total,
        idempotencyKey: idempotencyKey ?? null,
        items: {
          create: pricingResult.itemSnapshots.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPriceAtOrder: item.unitPriceAtOrder, // Snapshot
          })),
        },
        payment: {
          create: {
            method: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
          },
        },
      },
      include: {
        items: { include: { product: true } },
        shop: true,
        deliveryAddress: true,
        payment: true,
      },
    });

    return order;
  });

  res.status(201).json({
    success: true,
    data: createdOrder,
  });
}

export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: { include: { product: true } },
      shop: true,
      deliveryAddress: true,
      payment: true,
      rating: true,
    },
  });

  if (!order) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  }

  // Ownership check: customer who placed it, shopkeeper who owns the shop, assigned partner, or admin
  const isOwner =
    order.customerId === user.sub ||
    order.shop.ownerId === user.sub ||
    order.deliveryPartnerId === user.sub ||
    user.role === Role.ADMIN;

  if (!isOwner) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_RESOURCE,
      'You do not have permission to view this order.'
    );
  }

  res.status(200).json({
    success: true,
    data: order,
  });
}

export async function getOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = req.user;

  if (!user) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      customerId: true,
      deliveryPartnerId: true,
      updatedAt: true,
      shop: { select: { ownerId: true } },
    },
  });

  if (!order) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  }

  const isOwner =
    order.customerId === user.sub ||
    order.shop.ownerId === user.sub ||
    order.deliveryPartnerId === user.sub ||
    user.role === Role.ADMIN;

  if (!isOwner) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_RESOURCE,
      'You do not have permission to inspect this order status.'
    );
  }

  res.status(200).json({
    success: true,
    data: {
      orderId: order.id,
      status: order.status,
      updatedAt: order.updatedAt,
    },
  });
}

export async function getCustomerOrdersHandler(req: Request, res: Response): Promise<void> {
  const customerId = req.user?.sub;
  if (!customerId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { customerId },
      include: {
        items: { include: { product: true } },
        shop: true,
        deliveryAddress: true,
        payment: true,
        rating: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where: { customerId } }),
  ]);

  res.status(200).json({
    success: true,
    data: orders,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

export async function createOrderRatingHandler(req: Request, res: Response): Promise<void> {
  const customerId = req.user?.sub;
  const { id: orderId } = req.params;

  if (!customerId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const parseResult = createRatingSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Stars must be an integer between 1 and 5',
      parseResult.error.format()
    );
  }

  const { stars, comment } = parseResult.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { rating: true },
  });

  if (!order) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  }

  if (order.customerId !== customerId) {
    throw new AppError(
      403,
      ApiErrorCode.FORBIDDEN_RESOURCE,
      'You can only rate your own orders.'
    );
  }

  // Ratings are only permitted on DELIVERED orders (API Doc §3)
  if (order.status !== OrderStatus.DELIVERED) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Ratings can only be submitted after an order has been DELIVERED.'
    );
  }

  if (order.rating) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'This order has already been rated.'
    );
  }

  const rating = await prisma.rating.create({
    data: {
      orderId: order.id,
      customerId,
      shopId: order.shopId,
      stars,
      comment: comment ?? null,
    },
  });

  res.status(201).json({
    success: true,
    data: rating,
  });
}

export async function cancelCustomerOrderHandler(req: Request, res: Response): Promise<void> {
  const user = req.user;
  const { id: orderId } = req.params;

  if (!user) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shop: true },
  });

  if (!order) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  }

  // Execute transition via shared state machine (verifies cancellation legality and ownership)
  const nextStatus = executeOrderTransition({
    currentStatus: order.status as unknown as OrderStatus,
    event: 'CANCEL',
    actorRole: user.role,
    actorId: user.sub,
    orderCustomerId: order.customerId,
    shopOwnerId: order.shop.ownerId,
    assignedPartnerId: order.deliveryPartnerId,
  });

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
  });

  res.status(200).json({
    success: true,
    data: updatedOrder,
  });
}
