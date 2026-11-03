import { Router } from 'express';
import { Role } from '@shopright/shared-types';
import {
  createOrderHandler,
  getOrderHandler,
  getOrderStatusHandler,
  getCustomerOrdersHandler,
  createOrderRatingHandler,
  cancelCustomerOrderHandler,
} from './ordersController.js';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

export const ordersRouter = Router();

ordersRouter.use(authenticate);

ordersRouter.post('/', requireRole(Role.CUSTOMER), asyncHandler(createOrderHandler));
ordersRouter.get('/', requireRole(Role.CUSTOMER), asyncHandler(getCustomerOrdersHandler));
ordersRouter.get('/:id', asyncHandler(getOrderHandler));
ordersRouter.get('/:id/status', asyncHandler(getOrderStatusHandler));
ordersRouter.post('/:id/cancel', asyncHandler(cancelCustomerOrderHandler));
ordersRouter.post('/:id/rating', requireRole(Role.CUSTOMER), asyncHandler(createOrderRatingHandler));
