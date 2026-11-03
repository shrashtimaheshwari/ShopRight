import { Router } from 'express';
import { getAddressesHandler, createAddressHandler } from './addressesController.js';
import { authenticate } from '../auth/authMiddleware.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

export const addressesRouter = Router();

addressesRouter.use(authenticate);
addressesRouter.get('/', asyncHandler(getAddressesHandler));
addressesRouter.post('/', asyncHandler(createAddressHandler));
