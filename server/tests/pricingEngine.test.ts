import { describe, it, expect } from 'vitest';
import { ShopStatus, ApiErrorCode } from '@shopright/shared-types';
import {
  calculateOrderPricing,
  PricingShop,
  PricingProduct,
  PricingFeeRule,
} from '../src/modules/pricing/index.js';
import { LatLng } from '../src/modules/serviceability/index.js';
import { AppError } from '../src/middleware/errorHandler.js';

describe('Server-Authoritative Pricing Engine', () => {
  const mockShop: PricingShop = {
    id: 'shop-1',
    lat: 12.9716,
    lng: 77.5946,
    serviceRadiusKm: 5.0,
    status: ShopStatus.APPROVED,
  };

  const customerInRadius: LatLng = {
    lat: 12.9816,
    lng: 77.6046, // ~1.54 km away
  };

  const customerOutOfRadius: LatLng = {
    lat: 13.1000,
    lng: 77.7000, // ~18 km away
  };

  const mockDbProducts: PricingProduct[] = [
    { id: 'prod-apple', shopId: 'shop-1', name: 'Fresh Apples', price: 15000, inStock: true }, // ₹150.00
    { id: 'prod-milk', shopId: 'shop-1', name: 'Organic Milk', price: 6500, inStock: true },    // ₹65.00
    { id: 'prod-bread', shopId: 'shop-1', name: 'Sourdough Bread', price: 8000, inStock: false }, // Out of stock
    { id: 'prod-other', shopId: 'shop-2', name: 'Item from Shop 2', price: 5000, inStock: true }, // Foreign shop
  ];

  const mockFeeRule: PricingFeeRule = {
    baseFee: 3000, // ₹30.00
    perKmFee: 1000, // ₹10.00 per km
    freeDeliveryThreshold: 50000, // Free delivery above ₹500.00
  };

  it('calculates correct subtotal, delivery fee, and total in paise for a valid cart', () => {
    const items = [
      { productId: 'prod-apple', quantity: 2 }, // 2 * 15000 = 30000
      { productId: 'prod-milk', quantity: 1 },  // 1 * 6500  = 6500
    ];

    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items,
      dbProducts: mockDbProducts,
      activeFeeRule: mockFeeRule,
    });

    // Subtotal: 30000 + 6500 = 36500 paise (₹365.00)
    expect(result.subtotal).toBe(36500);

    // Distance: ~1.55 km -> baseFee (3000) + round(1.55 * 1000) = 3000 + 1550 = 4550 paise
    expect(result.distanceKm).toBe(1.55);
    expect(result.deliveryFee).toBe(4550);

    // Total: 36500 + 4550 = 41050 paise (₹410.50)
    expect(result.total).toBe(41050);

    // Immutable snapshots
    expect(result.itemSnapshots).toEqual([
      { productId: 'prod-apple', quantity: 2, unitPriceAtOrder: 15000 },
      { productId: 'prod-milk', quantity: 1, unitPriceAtOrder: 6500 },
    ]);
  });

  it('waives delivery fee when subtotal exceeds freeDeliveryThreshold', () => {
    const items = [
      { productId: 'prod-apple', quantity: 4 }, // 4 * 15000 = 60000 paise (₹600.00 > ₹500.00 threshold)
    ];

    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items,
      dbProducts: mockDbProducts,
      activeFeeRule: mockFeeRule,
    });

    expect(result.subtotal).toBe(60000);
    expect(result.deliveryFee).toBe(0);
    expect(result.total).toBe(60000);
  });

  it('rejects an order if any item is out of stock', () => {
    const items = [
      { productId: 'prod-apple', quantity: 1 },
      { productId: 'prod-bread', quantity: 1 }, // inStock: false
    ];

    expect(() =>
      calculateOrderPricing({
        shop: mockShop,
        customerLocation: customerInRadius,
        items,
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(
      expect.objectContaining({
        statusCode: 422,
        code: ApiErrorCode.PRODUCT_OUT_OF_STOCK,
      })
    );
  });

  it('rejects an order containing products from a different shop', () => {
    const items = [
      { productId: 'prod-apple', quantity: 1 },
      { productId: 'prod-other', quantity: 1 }, // Belongs to shop-2
    ];

    expect(() =>
      calculateOrderPricing({
        shop: mockShop,
        customerLocation: customerInRadius,
        items,
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        code: ApiErrorCode.VALIDATION_ERROR,
      })
    );
  });

  it('rejects an order if customer is out of the delivery radius', () => {
    const items = [{ productId: 'prod-apple', quantity: 1 }];

    expect(() =>
      calculateOrderPricing({
        shop: mockShop,
        customerLocation: customerOutOfRadius,
        items,
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(
      expect.objectContaining({
        statusCode: 422,
        code: ApiErrorCode.SHOP_OUT_OF_RANGE,
      })
    );
  });

  it('rejects an order if the shop is not in APPROVED status', () => {
    const unapprovedShop: PricingShop = {
      ...mockShop,
      status: ShopStatus.PENDING,
    };

    const items = [{ productId: 'prod-apple', quantity: 1 }];

    expect(() =>
      calculateOrderPricing({
        shop: unapprovedShop,
        customerLocation: customerInRadius,
        items,
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(
      expect.objectContaining({
        statusCode: 403,
        code: ApiErrorCode.SHOP_NOT_APPROVED,
      })
    );
  });

  // ─── Edge Cases ──────────────────────────────────────────────────────────────

  it('single item with quantity 1 (minimum valid order)', () => {
    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items: [{ productId: 'prod-milk', quantity: 1 }],
      dbProducts: mockDbProducts,
      activeFeeRule: mockFeeRule,
    });
    expect(result.subtotal).toBe(6500);
    expect(result.total).toBeGreaterThan(6500); // delivery fee added
    expect(result.itemSnapshots).toHaveLength(1);
  });

  it('large quantity calculates correct subtotal (no overflow for normal values)', () => {
    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items: [{ productId: 'prod-milk', quantity: 100 }],
      dbProducts: mockDbProducts,
      activeFeeRule: mockFeeRule,
    });
    expect(result.subtotal).toBe(6500 * 100); // 650000 paise = ₹6500
    expect(result.deliveryFee).toBe(0); // above free threshold (50000)
    expect(result.total).toBe(650000);
  });

  it('fee threshold boundary: subtotal equal to threshold gets free delivery', () => {
    // Add a special product priced at exactly freeDeliveryThreshold
    const boundaryProducts: PricingProduct[] = [
      { id: 'prod-boundary', shopId: 'shop-1', name: 'Boundary Product', price: 50000, inStock: true },
    ];
    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items: [{ productId: 'prod-boundary', quantity: 1 }],
      dbProducts: boundaryProducts,
      activeFeeRule: mockFeeRule,
    });
    expect(result.subtotal).toBe(50000);
    expect(result.deliveryFee).toBe(0); // exactly at threshold → free
    expect(result.total).toBe(50000);
  });

  it('fee threshold boundary: subtotal 1 paise below threshold incurs fee', () => {
    const belowThresholdProducts: PricingProduct[] = [
      { id: 'prod-below', shopId: 'shop-1', name: 'Below Threshold', price: 49999, inStock: true },
    ];
    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items: [{ productId: 'prod-below', quantity: 1 }],
      dbProducts: belowThresholdProducts,
      activeFeeRule: mockFeeRule,
    });
    expect(result.subtotal).toBe(49999);
    expect(result.deliveryFee).toBeGreaterThan(0); // delivery fee applies
  });

  it('rejects order when a requested product does not exist in DB', () => {
    expect(() =>
      calculateOrderPricing({
        shop: mockShop,
        customerLocation: customerInRadius,
        items: [{ productId: 'nonexistent-product-id', quantity: 1 }],
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrow();
  });

  it('SUSPENDED shop is rejected the same as PENDING', () => {
    const suspendedShop: PricingShop = { ...mockShop, status: ShopStatus.SUSPENDED };
    expect(() =>
      calculateOrderPricing({
        shop: suspendedShop,
        customerLocation: customerInRadius,
        items: [{ productId: 'prod-apple', quantity: 1 }],
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(expect.objectContaining({ code: ApiErrorCode.SHOP_NOT_APPROVED }));
  });

  it('REJECTED shop is rejected the same as PENDING', () => {
    const rejectedShop: PricingShop = { ...mockShop, status: ShopStatus.REJECTED };
    expect(() =>
      calculateOrderPricing({
        shop: rejectedShop,
        customerLocation: customerInRadius,
        items: [{ productId: 'prod-apple', quantity: 1 }],
        dbProducts: mockDbProducts,
        activeFeeRule: mockFeeRule,
      })
    ).toThrowError(expect.objectContaining({ code: ApiErrorCode.SHOP_NOT_APPROVED }));
  });

  it('no freeDeliveryThreshold (null) always charges delivery fee', () => {
    const feeRuleNoFree: PricingFeeRule = { baseFee: 3000, perKmFee: 1000, freeDeliveryThreshold: null };
    const result = calculateOrderPricing({
      shop: mockShop,
      customerLocation: customerInRadius,
      items: [{ productId: 'prod-apple', quantity: 100 }], // huge subtotal
      dbProducts: mockDbProducts,
      activeFeeRule: feeRuleNoFree,
    });
    expect(result.deliveryFee).toBeGreaterThan(0); // No threshold — always paid
  });
});
