import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { Role } from '@shopright/shared-types';
import {
  setAvailabilityHandler,
  updateLocationHandler,
  getAssignedOrdersHandler,
  pickupOrderHandler,
  deliverOrderHandler,
} from './deliveryController.js';

export const deliveryRouter = Router();

// All delivery routes require authentication + DELIVERY_PARTNER role
deliveryRouter.use(authenticate, requireRole(Role.DELIVERY_PARTNER));

deliveryRouter.patch('/availability', asyncHandler(setAvailabilityHandler));
deliveryRouter.patch('/location', asyncHandler(updateLocationHandler));
deliveryRouter.get('/orders', asyncHandler(getAssignedOrdersHandler));
deliveryRouter.post('/orders/:orderId/pickup', asyncHandler(pickupOrderHandler));
deliveryRouter.post('/orders/:orderId/deliver', asyncHandler(deliverOrderHandler));

