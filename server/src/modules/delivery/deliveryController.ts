import { Request, Response } from 'express';
import { z } from 'zod';
import { Role, OrderStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { executeOrderTransition } from '../../stateMachine/orderStateMachine.js';
import { calculateHaversineDistanceKm } from '../serviceability/index.js';

// ─── Validation Schemas ────────────────────────────────────────────────────────

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

// ─── Availability & Location ───────────────────────────────────────────────────

/**
 * PATCH /api/v1/delivery/availability
 * Toggle duty on/off and optionally update current GPS location.
 */
export async function setAvailabilityHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = availabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'Invalid availability data.', parsed.error.format());
  }
  const { isAvailable, lat, lng } = parsed.data;

  // Upsert profile — delivery partners may not have one yet
  const profile = await prisma.deliveryPartnerProfile.upsert({
    where: { userId },
    create: {
      userId,
      isAvailable,
      currentLat: lat ?? null,
      currentLng: lng ?? null,
    },
    update: {
      isAvailable,
      ...(lat !== undefined ? { currentLat: lat } : {}),
      ...(lng !== undefined ? { currentLng: lng } : {}),
    },
  });

  res.status(200).json({ success: true, data: profile });
}

/**
 * PATCH /api/v1/delivery/location
 * Update current GPS coordinates without changing availability status.
 */
export async function updateLocationHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(400, ApiErrorCode.VALIDATION_ERROR, 'lat and lng are required.', parsed.error.format());
  }
  const { lat, lng } = parsed.data;

  const profile = await prisma.deliveryPartnerProfile.upsert({
    where: { userId },
    create: { userId, currentLat: lat, currentLng: lng, isAvailable: false },
    update: { currentLat: lat, currentLng: lng },
  });

  res.status(200).json({ success: true, data: profile });
}

// ─── Assigned Orders ───────────────────────────────────────────────────────────

/**
 * GET /api/v1/delivery/orders
 * List orders currently assigned to this delivery partner.
 */
export async function getAssignedOrdersHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const orders = await prisma.order.findMany({
    where: {
      deliveryPartnerId: userId,
      status: { in: [OrderStatus.READY, OrderStatus.PICKED_UP] },
    },
    include: {
      items: { include: { product: true } },
      shop: true,
      deliveryAddress: true,
      payment: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  res.status(200).json({ success: true, data: orders });
}

/**
 * POST /api/v1/delivery/orders/:orderId/pickup
 * Transition READY → PICKED_UP (only the assigned partner).
 */
export async function pickupOrderHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  const { orderId } = req.params;
  if (!userId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shop: true },
  });
  if (!order) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');

  const nextStatus = executeOrderTransition({
    currentStatus: order.status as unknown as OrderStatus,
    event: 'PICKUP',
    actorRole: Role.DELIVERY_PARTNER,
    actorId: userId,
    orderCustomerId: order.customerId,
    shopOwnerId: order.shop.ownerId,
    assignedPartnerId: order.deliveryPartnerId,
  });

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
    include: { shop: true, deliveryAddress: true, payment: true },
  });

  res.status(200).json({ success: true, data: updated });
}

/**
 * POST /api/v1/delivery/orders/:orderId/deliver
 * Transition PICKED_UP → DELIVERED (only the assigned partner).
 */
export async function deliverOrderHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  const { orderId } = req.params;
  if (!userId) throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shop: true, payment: true },
  });
  if (!order) throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Order not found.');

  const nextStatus = executeOrderTransition({
    currentStatus: order.status as unknown as OrderStatus,
    event: 'DELIVER',
    actorRole: Role.DELIVERY_PARTNER,
    actorId: userId,
    orderCustomerId: order.customerId,
    shopOwnerId: order.shop.ownerId,
    assignedPartnerId: order.deliveryPartnerId,
  });

  // Atomically: mark order DELIVERED + mark COD payment COMPLETED
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
      include: { shop: true, deliveryAddress: true, payment: true },
    });
    if (o.payment) {
      await tx.payment.update({
        where: { id: o.payment.id },
        data: { status: 'COMPLETED' },
      });
    }
    return o;
  });

  res.status(200).json({ success: true, data: updated });
}

// ─── Auto-Assignment Service (called internally after MARK_READY) ──────────────

/**
 * Finds the nearest available delivery partner to the shop and assigns the order.
 * ADR-007: Nearest available partner wins. No partner = order stays READY unassigned.
 */
export async function autoAssignDeliveryPartner(orderId: string, shopLat: number, shopLng: number): Promise<void> {
  // Fetch all available partners with a known location
  const available = await prisma.deliveryPartnerProfile.findMany({
    where: {
      isAvailable: true,
      currentLat: { not: null },
      currentLng: { not: null },
    },
    include: { user: true },
  });

  if (available.length === 0) return; // No partner available — order stays unassigned

  // Find nearest by Haversine distance
  let nearest = available[0];
  let minDist = calculateHaversineDistanceKm(
    { lat: shopLat, lng: shopLng },
    { lat: nearest.currentLat!, lng: nearest.currentLng! }
  );

  for (const partner of available.slice(1)) {
    const dist = calculateHaversineDistanceKm(
      { lat: shopLat, lng: shopLng },
      { lat: partner.currentLat!, lng: partner.currentLng! }
    );
    if (dist < minDist) {
      minDist = dist;
      nearest = partner;
    }
  }

  // Assign the order to the nearest available partner
  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryPartnerId: nearest.userId },
  });
}

