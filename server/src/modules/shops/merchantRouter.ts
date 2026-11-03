import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { Role } from '@shopright/shared-types';
import {
  createShopHandler,
  getMerchantShopsHandler,
  getMerchantOrdersHandler,
  updateMerchantOrderStatusHandler,
  getMerchantProductsHandler,
  createProductHandler,
  updateProductHandler,
  toggleProductStockHandler,
} from './merchantController.js';

export const merchantRouter = Router();

// All merchant routes require authentication + SHOPKEEPER role
merchantRouter.use(authenticate, requireRole(Role.SHOPKEEPER));

// Shop management
merchantRouter.post('/shops', asyncHandler(createShopHandler));
merchantRouter.get('/shops', asyncHandler(getMerchantShopsHandler));

// Order inbox
merchantRouter.get('/shops/:shopId/orders', asyncHandler(getMerchantOrdersHandler));
merchantRouter.patch('/shops/:shopId/orders/:orderId/status', asyncHandler(updateMerchantOrderStatusHandler));

// Product management
merchantRouter.get('/products', asyncHandler(getMerchantProductsHandler));
merchantRouter.post('/products', asyncHandler(createProductHandler));
merchantRouter.patch('/products/:productId', asyncHandler(updateProductHandler));
merchantRouter.patch('/products/:productId/stock', asyncHandler(toggleProductStockHandler));

