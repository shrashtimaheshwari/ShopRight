import { Router } from 'express';
import { getNearbyShopsHandler, getShopProductsHandler } from './shopsController.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';

export const shopsRouter = Router();

shopsRouter.get('/', asyncHandler(getNearbyShopsHandler));
shopsRouter.get('/nearby', asyncHandler(getNearbyShopsHandler));
shopsRouter.get('/:shopId/products', asyncHandler(getShopProductsHandler));
