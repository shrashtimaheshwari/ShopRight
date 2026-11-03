import { Request, Response } from 'express';
import { z } from 'zod';
import { ShopStatus, ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';
import { calculateHaversineDistanceKm } from '../serviceability/index.js';

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function getNearbyShopsHandler(req: Request, res: Response): Promise<void> {
  const parseResult = nearbyQuerySchema.safeParse(req.query);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Valid lat (-90 to 90) and lng (-180 to 180) query parameters are required.',
      parseResult.error.format()
    );
  }

  const { lat, lng } = parseResult.data;
  const customerLoc = { lat, lng };

  // Only APPROVED shops can be discovered by customers (Design Doc §4.3 & §5.1)
  const approvedShops = await prisma.shop.findMany({
    where: { status: ShopStatus.APPROVED },
    select: {
      id: true,
      ownerId: true,
      name: true,
      description: true,
      category: true,
      lat: true,
      lng: true,
      address: true,
      status: true,
      serviceRadiusKm: true,
      createdAt: true,
    },
  });

  const serviceableShops = approvedShops
    .map((shop) => {
      const distanceKm = calculateHaversineDistanceKm(
        { lat: shop.lat, lng: shop.lng },
        customerLoc
      );
      return {
        ...shop,
        distanceKm,
      };
    })
    .filter((shop) => shop.distanceKm <= shop.serviceRadiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  res.status(200).json({
    success: true,
    data: serviceableShops,
  });
}

export async function getShopProductsHandler(req: Request, res: Response): Promise<void> {
  const { shopId } = req.params;
  const includeOutOfStock = req.query.includeOutOfStock === 'true';

  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
  });

  if (!shop) {
    throw new AppError(404, ApiErrorCode.NOT_FOUND, 'Shop not found.');
  }

  const products = await prisma.product.findMany({
    where: {
      shopId,
      ...(includeOutOfStock ? {} : { inStock: true }),
    },
    orderBy: { name: 'asc' },
  });

  res.status(200).json({
    success: true,
    data: products,
  });
}
