import { Request, Response } from 'express';
import { z } from 'zod';
import { Role, ShopStatus, OrderStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { executeOrderTransition, OrderEvent } from '../../stateMachine/orderStateMachine.js';
import { autoAssignDeliveryPartner } from '../delivery/index.js';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const createShopSchema = z.object({
  name: z.string().min(2, 'Shop name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  category: z.string().min(2, 'Category is required'),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(5, 'Address is required'),
  serviceRadiusKm: z.number().positive().max(50).optional().default(5.0),
});

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().min(10).optional(),
  price: z.number().int().positive('Price must be a positive integer in paise').optional(),
  unit: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
});

const createProductSchema = z.object({
  shopId: z.string().min(1, 'shopId is required'),
  name: z.string().min(2, 'Product name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  price: z.number().int().positive('Price must be a positive integer in paise'),
  unit: z.string().min(1, 'Unit is required (e.g. "kg", "litre", "piece")'),
  imageUrl: z.string().url('imageUrl must be a valid URL'),
  inStock: z.boolean().optional().default(true),
});

const merchantOrderStatusSchema = z.object({
  event: z.enum(['ACCEPT', 'REJECT', 'START_PREPARING', 'MARK_READY']),
});

// ─── Shop Management ───────────────────────────────────────────────────────────

/** POST /api/v1/merchant/shops — Register a new shop (starts as PENDING) */
export async function createShopHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = createShopSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid shop data.', parsed.error.format());
  }

  const { name, description, category, lat, lng, address, serviceRadiusKm } = parsed.data;

  const shop = await prisma.shop.create({
    data: { ownerId, name, description, category, lat, lng, address, serviceRadiusKm, status: ShopStatus.PENDING },
  });

  res.status(201).json({ success: true, data: shop });
}

/** GET /api/v1/merchant/shops — List all shops owned by the authenticated shopkeeper */
export async function getMerchantShopsHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const shops = await prisma.shop.findMany({
    where: { ownerId },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({ success: true, data: shops });
}

// ─── Order Inbox ───────────────────────────────────────────────────────────────

/** GET /api/v1/merchant/shops/:shopId/orders — Paginated order inbox with optional status filter */
export async function getMerchantOrdersHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  const { shopId } = req.params;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  // Ownership check: verify this shopkeeper owns the shop
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');
  if (shop.ownerId !== ownerId) throw new AppError(403, ApiErrorCode.FORBIDDEN_RESOURCE, 'You do not own this shop.');

  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  const where = {
    shopId,
    ...(statusFilter ? { status: statusFilter as OrderStatus } : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: true } },
        customer: { select: { id: true, name: true, phone: true } },
        deliveryAddress: true,
        payment: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: orders,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

/** PATCH /api/v1/merchant/shops/:shopId/orders/:orderId/status — Advance order status via state machine */
export async function updateMerchantOrderStatusHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  const { shopId, orderId } = req.params;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = merchantOrderStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid event. Must be ACCEPT, REJECT, START_PREPARING, or MARK_READY.', parsed.error.format());
  }
  const { event } = parsed.data;

  // Load order and verify shop ownership
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shop: true },
  });
  if (!order) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');
  if (order.shopId !== shopId) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order does not belong to this shop.');

  const nextStatus = executeOrderTransition({
    currentStatus: order.status as unknown as OrderStatus,
    event: event as OrderEvent,
    actorRole: Role.SHOPKEEPER,
    actorId: ownerId,
    orderCustomerId: order.customerId,
    shopOwnerId: order.shop.ownerId,
    assignedPartnerId: order.deliveryPartnerId,
  });

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
    include: {
      items: { include: { product: true } },
      shop: true,
      deliveryAddress: true,
      payment: true,
    },
  });

  // ADR-007: Auto-assign nearest available partner when order becomes READY
  if (event === 'MARK_READY') {
    // Fire-and-forget; non-critical path — failure does not block the response
    autoAssignDeliveryPartner(orderId, order.shop.lat, order.shop.lng).catch(() => {});
  }

  res.status(200).json({ success: true, data: updated });
}

// ─── Product Management ────────────────────────────────────────────────────────

/** GET /api/v1/merchant/products?shopId=... — List products for a shop (owner only) */
export async function getMerchantProductsHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  const shopId = req.query.shopId as string;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  if (!shopId) throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'shopId query parameter is required.');

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');
  if (shop.ownerId !== ownerId) throw new AppError(403, ApiErrorCode.FORBIDDEN_RESOURCE, 'You do not own this shop.');

  const products = await prisma.product.findMany({
    where: { shopId },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({ success: true, data: products });
}

/** POST /api/v1/merchant/products — Create a new product */
export async function createProductHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = createProductSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid product data.', parsed.error.format());
  }
  const { shopId, name, description, price, unit, imageUrl, inStock } = parsed.data;

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');
  if (shop.ownerId !== ownerId) throw new AppError(403, ApiErrorCode.FORBIDDEN_RESOURCE, 'You do not own this shop.');

  const product = await prisma.product.create({
    data: { shopId, name, description, price, unit, imageUrl, inStock },
  });

  res.status(201).json({ success: true, data: product });
}

/** PATCH /api/v1/merchant/products/:productId — Update product details (owner only) */
export async function updateProductHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  const { productId } = req.params;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = updateProductSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid product update data.', parsed.error.format());
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, include: { shop: true } });
  if (!product) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Product not found.');
  if (product.shop.ownerId !== ownerId) throw new AppError(403, ApiErrorCode.FORBIDDEN_RESOURCE, 'You do not own this product.');

  const updated = await prisma.product.update({
    where: { id: productId },
    data: parsed.data,
  });

  res.status(200).json({ success: true, data: updated });
}

/** PATCH /api/v1/merchant/products/:productId/stock — Toggle inStock flag */
export async function toggleProductStockHandler(req: Request, res: Response): Promise<void> {
  const ownerId = req.user?.sub;
  const { productId } = req.params;
  if (!ownerId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = z.object({ inStock: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Body must include { "inStock": true | false }.');
  }

  const product = await prisma.product.findUnique({ where: { id: productId }, include: { shop: true } });
  if (!product) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Product not found.');
  if (product.shop.ownerId !== ownerId) throw new AppError(403, ApiErrorCode.FORBIDDEN_RESOURCE, 'You do not own this product.');

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { inStock: parsed.data.inStock },
  });

  res.status(200).json({ success: true, data: updated });
}
