import { Router } from 'express';
import { Role } from '@shopright/shared-types';
import { authenticate, requireRole } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { initiatePaymentHandler, youpiWebhookHandler } from './paymentsController.js';

export const paymentsRouter = Router();

// POST /payments/webhook/youpi — no auth, raw body (registered with express.raw in app.ts)
paymentsRouter.post('/webhook/youpi', asyncHandler(youpiWebhookHandler));

// POST /orders/:id/pay — authenticated customer (also mounted in ordersRouter)
paymentsRouter.post('/orders/:id/pay', authenticate, requireRole(Role.CUSTOMER), asyncHandler(initiatePaymentHandler));
