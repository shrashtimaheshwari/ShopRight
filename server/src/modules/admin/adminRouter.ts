import { Router } from 'express';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { Role } from '@shopright/shared-types';
import {
  listAllShopsHandler,
  approveShopHandler,
  rejectShopHandler,
  suspendShopHandler,
  listAllOrdersHandler,
  createFeeRuleHandler,
  listFeeRulesHandler,
  getAnalyticsHandler,
} from './adminController.js';

export const adminRouter = Router();

// All admin routes require authentication + ADMIN role (Security Doc §4)
adminRouter.use(authenticate, requireRole(Role.ADMIN));

// Shop moderation
adminRouter.get('/shops', asyncHandler(listAllShopsHandler));
adminRouter.patch('/shops/:shopId/approve', asyncHandler(approveShopHandler));
adminRouter.patch('/shops/:shopId/reject', asyncHandler(rejectShopHandler));
adminRouter.patch('/shops/:shopId/suspend', asyncHandler(suspendShopHandler));

// Order management
adminRouter.get('/orders', asyncHandler(listAllOrdersHandler));

// Delivery fee rule versioning
adminRouter.post('/fee-rules', asyncHandler(createFeeRuleHandler));
adminRouter.get('/fee-rules', asyncHandler(listFeeRulesHandler));

// Analytics
adminRouter.get('/analytics', asyncHandler(getAnalyticsHandler));

