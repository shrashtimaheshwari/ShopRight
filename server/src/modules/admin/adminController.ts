import { Request, Response } from 'express';
import { z } from 'zod';
import { ShopStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';

// ─── Shop Moderation ───────────────────────────────────────────────────────────

/** GET /api/v1/admin/shops — List all shops (filterable by status) */
export async function listAllShopsHandler(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  const where = statusFilter ? { status: statusFilter as ShopStatus } : {};

  const [shops, total] = await Promise.all([
    prisma.shop.findMany({
      where,
      include: { owner: { select: { id: true, name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.shop.count({ where }),
  ]);

  res.status(200).json({
    success: true,
    data: shops,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

/** PATCH /api/v1/admin/shops/:shopId/approve */
export async function approveShopHandler(req: Request, res: Response): Promise<void> {
  const { shopId } = req.params;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');

  const updated = await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.APPROVED } });
  res.status(200).json({ success: true, data: updated });
}

/** PATCH /api/v1/admin/shops/:shopId/reject */
export async function rejectShopHandler(req: Request, res: Response): Promise<void> {
  const { shopId } = req.params;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');

  const updated = await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.REJECTED } });
  res.status(200).json({ success: true, data: updated });
}

/** PATCH /api/v1/admin/shops/:shopId/suspend */
export async function suspendShopHandler(req: Request, res: Response): Promise<void> {
  const { shopId } = req.params;
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');

  const updated = await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.SUSPENDED } });
  res.status(200).json({ success: true, data: updated });
}

// ─── Order Management ──────────────────────────────────────────────────────────

/** GET /api/v1/admin/orders — All orders (paginated, status filter) */
export async function listAllOrdersHandler(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const skip = (page - 1) * limit;
  const statusFilter = req.query.status as string | undefined;

  const where = statusFilter ? { status: statusFilter as any } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        shop: { select: { id: true, name: true } },
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

// ─── Delivery Fee Rules ────────────────────────────────────────────────────────

const feeRuleSchema = z.object({
  baseFee: z.number().int().nonnegative('baseFee must be a non-negative integer in paise'),
  perKmFee: z.number().int().nonnegative('perKmFee must be a non-negative integer in paise'),
  freeDeliveryThreshold: z.number().int().positive().nullable().optional(),
});

/** POST /api/v1/admin/fee-rules — Create a new versioned fee rule */
export async function createFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const parsed = feeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid fee rule data.', parsed.error.format());
  }

  const { baseFee, perKmFee, freeDeliveryThreshold } = parsed.data;

  const rule = await prisma.deliveryFeeRule.create({
    data: {
      baseFee,
      perKmFee,
      freeDeliveryThreshold: freeDeliveryThreshold ?? null,
    },
  });

  res.status(201).json({ success: true, data: rule });
}

/** GET /api/v1/admin/fee-rules — List all fee rules ordered by effectiveFrom desc */
export async function listFeeRulesHandler(req: Request, res: Response): Promise<void> {
  const rules = await prisma.deliveryFeeRule.findMany({
    orderBy: { effectiveFrom: 'desc' },
  });
  res.status(200).json({ success: true, data: rules });
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/** GET /api/v1/admin/analytics — System-wide metrics */
export async function getAnalyticsHandler(req: Request, res: Response): Promise<void> {
  const [
    totalShops,
    pendingShops,
    approvedShops,
    totalOrders,
    deliveredOrders,
    totalRevenue,
    totalUsers,
  ] = await Promise.all([
    prisma.shop.count(),
    prisma.shop.count({ where: { status: ShopStatus.PENDING } }),
    prisma.shop.count({ where: { status: ShopStatus.APPROVED } }),
    prisma.order.count(),
    prisma.order.count({ where: { status: 'DELIVERED' } }),
    prisma.order.aggregate({ _sum: { total: true }, where: { status: 'DELIVERED' } }),
    prisma.user.count(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      shops: { total: totalShops, pending: pendingShops, approved: approvedShops },
      orders: { total: totalOrders, delivered: deliveredOrders },
      revenue: { totalPaise: totalRevenue._sum.total ?? 0 },
      users: { total: totalUsers },
    },
  });
}

