import { Request, Response } from 'express';
import { z } from 'zod';
import { ApiErrorCode } from '@shopright/shared-types';
import { prisma } from '../../prisma.js';
import { AppError } from '../../middleware/errorHandler.js';

const addressSchema = z.object({
  label: z.string().min(1, 'Label is required (e.g. Home, Work)'),
  line1: z.string().min(3, 'Address line is required'),
  city: z.string().min(2, 'City is required'),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  isDefault: z.boolean().optional().default(false),
});

export async function getAddressesHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json({
    success: true,
    data: addresses,
  });
}

export async function createAddressHandler(req: Request, res: Response): Promise<void> {
  const userId = req.user?.sub;
  if (!userId) {
    throw new AppError(401, ApiErrorCode.UNAUTHORIZED, 'Authentication required.');
  }

  const parseResult = addressSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Invalid address payload',
      parseResult.error.format()
    );
  }

  const { label, line1, city, lat, lng, isDefault } = parseResult.data;

  // If this address is set as default, reset other addresses for this user
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      userId,
      label,
      line1,
      city,
      lat,
      lng,
      isDefault,
    },
  });

  res.status(201).json({
    success: true,
    data: address,
  });
}
