import { ShopStatus, ApiErrorCode } from '@shopright/shared-types';
import { AppError } from '../../middleware/errorHandler.js';
import { calculateHaversineDistanceKm, isWithinRange, LatLng } from '../serviceability/index.js';

export interface PricingProduct {
  id: string;
  shopId: string;
  name: string;
  price: number; // in paise
  inStock: boolean;
}

export interface PricingShop {
  id: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  status: ShopStatus;
}

export interface PricingItemRequest {
  productId: string;
  quantity: number;
}

export interface PricingFeeRule {
  baseFee: number; // in paise
  perKmFee: number; // in paise
  freeDeliveryThreshold?: number | null; // in paise
}

export interface PricingCalculationParams {
  shop: PricingShop;
  customerLocation: LatLng;
  items: PricingItemRequest[];
  dbProducts: PricingProduct[];
  activeFeeRule: PricingFeeRule;
}

export interface OrderItemSnapshot {
  productId: string;
  quantity: number;
  unitPriceAtOrder: number; // in paise
}

export interface PricingResult {
  subtotal: number; // in paise
  deliveryFee: number; // in paise
  total: number; // in paise
  distanceKm: number;
  itemSnapshots: OrderItemSnapshot[];
}

/**
 * Authoritative Server-Side Pricing Engine (Design Doc §5.2, Security Doc §3, ADR-001).
 *
 * Ground Rules:
 * 1. The client NEVER provides price, subtotal, delivery fee, or total.
 * 2. Prices are strictly derived from authoritative database products.
 * 3. All amounts are integer paise to eliminate floating-point rounding errors.
 */
export function calculateOrderPricing(params: PricingCalculationParams): PricingResult {
  const { shop, customerLocation, items, dbProducts, activeFeeRule } = params;

  // 1. Validate shop approval status (Security Doc §12)
  if (shop.status !== ShopStatus.APPROVED) {
    throw new AppError(
      403,
      ApiErrorCode.SHOP_NOT_APPROVED,
      'Orders can only be placed with APPROVED shops.'
    );
  }

  // 2. Validate serviceability (Design Doc §5.1)
  const shopLoc: LatLng = { lat: shop.lat, lng: shop.lng };
  const inRange = isWithinRange(shopLoc, customerLocation, shop.serviceRadiusKm);
  if (!inRange) {
    throw new AppError(
      422,
      ApiErrorCode.SHOP_OUT_OF_RANGE,
      'This shop does not deliver to your location.'
    );
  }

  // 3. Validate items list
  if (!items || items.length === 0) {
    throw new AppError(
      400,
      ApiErrorCode.VALIDATION_ERROR,
      'Order must contain at least one item.'
    );
  }

  const dbProductMap = new Map<string, PricingProduct>();
  for (const p of dbProducts) {
    dbProductMap.set(p.id, p);
  }

  let subtotal = 0;
  const itemSnapshots: OrderItemSnapshot[] = [];

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new AppError(
        400,
        ApiErrorCode.VALIDATION_ERROR,
        `Invalid quantity for product ${item.productId}. Must be positive integer.`
      );
    }

    const product = dbProductMap.get(item.productId);
    if (!product) {
      throw new AppError(
        404,
        ApiErrorCode.NOT_FOUND,
        `Product ${item.productId} was not found.`
      );
    }

    // Security Check: prevent multi-shop carts / foreign products
    if (product.shopId !== shop.id) {
      throw new AppError(
        400,
        ApiErrorCode.VALIDATION_ERROR,
        `Product ${product.name} does not belong to shop ${shop.id}.`
      );
    }

    // Stock availability check
    if (!product.inStock) {
      throw new AppError(
        422,
        ApiErrorCode.PRODUCT_OUT_OF_STOCK,
        `Product "${product.name}" is currently out of stock.`
      );
    }

    const lineItemTotal = product.price * item.quantity;
    subtotal += lineItemTotal;

    itemSnapshots.push({
      productId: product.id,
      quantity: item.quantity,
      unitPriceAtOrder: product.price, // Immutable price snapshot
    });
  }

  // 4. Calculate delivery fee based on Haversine distance and active fee rule
  const distanceKm = calculateHaversineDistanceKm(shopLoc, customerLocation);
  let deliveryFee = 0;

  if (
    activeFeeRule.freeDeliveryThreshold != null &&
    subtotal >= activeFeeRule.freeDeliveryThreshold
  ) {
    deliveryFee = 0;
  } else {
    deliveryFee = activeFeeRule.baseFee + Math.round(distanceKm * activeFeeRule.perKmFee);
  }

  // 5. Total calculation
  const total = subtotal + deliveryFee;

  return {
    subtotal,
    deliveryFee,
    total,
    distanceKm,
    itemSnapshots,
  };
}
