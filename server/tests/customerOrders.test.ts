import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Role, OrderStatus, ShopStatus, ApiErrorCode } from '@shopright/shared-types';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';

describe('Customer Journey & Order Placement Integration', () => {
  const app = createApp();

  // Test state
  let customer1Token = '';
  let customer1Id = '';
  let customer2Token = '';
  let customer2Id = '';
  let shopkeeperId = '';
  let approvedShopId = '';
  let pendingShopId = '';
  let inStockProduct1Id = '';
  let inStockProduct2Id = '';
  let outOfStockProductId = '';
  let customer1InRadiusAddressId = '';
  let customer1OutOfRadiusAddressId = '';

  beforeAll(async () => {
    // 1. Create a shopkeeper and shops
    const shopkeeper = await prisma.user.create({
      data: {
        name: 'Merchant Test',
        email: `merchant_test_${Date.now()}@example.com`,
        phone: '+919900000001',
        passwordHash: 'hash',
        role: Role.SHOPKEEPER,
      },
    });
    shopkeeperId = shopkeeper.id;

    // Approved shop at MG Road (12.9752, 77.6095), radius 5 km
    const shop1 = await prisma.shop.create({
      data: {
        ownerId: shopkeeperId,
        name: 'Test Approved Grocery',
        description: 'Quality groceries',
        category: 'Groceries',
        lat: 12.9752,
        lng: 77.6095,
        address: 'MG Road, Bangalore',
        status: ShopStatus.APPROVED,
        serviceRadiusKm: 5.0,
      },
    });
    approvedShopId = shop1.id;

    // Unapproved shop (PENDING)
    const shop2 = await prisma.shop.create({
      data: {
        ownerId: shopkeeperId,
        name: 'Test Unapproved Store',
        description: 'Pending',
        category: 'Groceries',
        lat: 12.9752,
        lng: 77.6095,
        address: 'MG Road, Bangalore',
        status: ShopStatus.PENDING,
        serviceRadiusKm: 5.0,
      },
    });
    pendingShopId = shop2.id;

    // Products for shop 1
    const p1 = await prisma.product.create({
      data: {
        shopId: approvedShopId,
        name: 'Organic Bananas',
        description: 'Fresh bananas',
        price: 6000, // ₹60.00 in paise
        unit: 'dozen',
        imageUrl: 'http://example.com/banana.jpg',
        inStock: true,
      },
    });
    inStockProduct1Id = p1.id;

    const p2 = await prisma.product.create({
      data: {
        shopId: approvedShopId,
        name: 'Cold Pressed Olive Oil',
        description: 'Extra virgin olive oil',
        price: 85000, // ₹850.00 in paise
        unit: 'bottle',
        imageUrl: 'http://example.com/oil.jpg',
        inStock: true,
      },
    });
    inStockProduct2Id = p2.id;

    const p3 = await prisma.product.create({
      data: {
        shopId: approvedShopId,
        name: 'Speciality Cheese',
        description: 'Artisanal cheese',
        price: 32000, // ₹320.00 in paise
        unit: 'block',
        imageUrl: 'http://example.com/cheese.jpg',
        inStock: false, // OUT OF STOCK
      },
    });
    outOfStockProductId = p3.id;

    // 2. Register Customer 1
    const cust1Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Customer One',
        email: `customer1_${Date.now()}@example.com`,
        phone: '+919900000002',
        password: 'Password123!',
        role: Role.CUSTOMER,
      });
    customer1Token = cust1Res.body.data.accessToken;
    customer1Id = cust1Res.body.data.user.id;

    // 3. Register Customer 2 (for cross-user ownership tests)
    const cust2Res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        name: 'Customer Two',
        email: `customer2_${Date.now()}@example.com`,
        phone: '+919900000003',
        password: 'Password123!',
        role: Role.CUSTOMER,
      });
    customer2Token = cust2Res.body.data.accessToken;
    customer2Id = cust2Res.body.data.user.id;

    // 4. Create addresses for Customer 1
    // In-radius address: Indiranagar (~3.4 km from MG Road)
    const inRadiusAddr = await prisma.address.create({
      data: {
        userId: customer1Id,
        label: 'Home',
        line1: '100ft Road, Indiranagar',
        city: 'Bengaluru',
        lat: 12.9784,
        lng: 77.6408,
        isDefault: true,
      },
    });
    customer1InRadiusAddressId = inRadiusAddr.id;

    // Out-of-radius address: Electronic City (~15 km from MG Road)
    const outOfRadiusAddr = await prisma.address.create({
      data: {
        userId: customer1Id,
        label: 'Office',
        line1: 'Phase 1, Electronic City',
        city: 'Bengaluru',
        lat: 12.8399,
        lng: 77.6770,
        isDefault: false,
      },
    });
    customer1OutOfRadiusAddressId = outOfRadiusAddr.id;
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.rating.deleteMany({ where: { customerId: { in: [customer1Id, customer2Id] } } });
    await prisma.orderItem.deleteMany({ where: { order: { customerId: { in: [customer1Id, customer2Id] } } } });
    await prisma.payment.deleteMany({ where: { order: { customerId: { in: [customer1Id, customer2Id] } } } });
    await prisma.order.deleteMany({ where: { customerId: { in: [customer1Id, customer2Id] } } });
    await prisma.product.deleteMany({ where: { shopId: { in: [approvedShopId, pendingShopId] } } });
    await prisma.shop.deleteMany({ where: { id: { in: [approvedShopId, pendingShopId] } } });
    await prisma.address.deleteMany({ where: { userId: { in: [customer1Id, customer2Id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [customer1Id, customer2Id, shopkeeperId] } } });
    await prisma.$disconnect();
  });

  describe('Shop Discovery & Catalog Browsing', () => {
    it('GET /api/v1/shops/nearby returns approved shops with distance and excludes unapproved shops', async () => {
      // Indiranagar coordinates (12.9784, 77.6408) -> within 5km of MG Road shop
      const res = await request(app)
        .get('/api/v1/shops/nearby')
        .query({ lat: 12.9784, lng: 77.6408 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);

      const returnedShopIds = res.body.data.map((s: any) => s.id);
      // Must contain approved shop
      expect(returnedShopIds).toContain(approvedShopId);
      // Must strictly NOT contain unapproved shop
      expect(returnedShopIds).not.toContain(pendingShopId);

      const shop = res.body.data.find((s: any) => s.id === approvedShopId);
      expect(shop.distanceKm).toBeGreaterThan(0);
      expect(shop.distanceKm).toBeLessThanOrEqual(5.0);
    });

    it('GET /api/v1/shops/nearby returns empty list if user is too far from all shops', async () => {
      // Whitefield coordinates (12.9698, 77.7499) -> ~15 km from MG Road shop
      const res = await request(app)
        .get('/api/v1/shops/nearby')
        .query({ lat: 12.9698, lng: 77.7499 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const returnedShopIds = res.body.data.map((s: any) => s.id);
      expect(returnedShopIds).not.toContain(approvedShopId);
    });

    it('GET /api/v1/shops/:shopId/products returns only in-stock products by default', async () => {
      const res = await request(app).get(`/api/v1/shops/${approvedShopId}/products`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const productIds = res.body.data.map((p: any) => p.id);
      expect(productIds).toContain(inStockProduct1Id);
      expect(productIds).toContain(inStockProduct2Id);
      expect(productIds).not.toContain(outOfStockProductId);
    });

    it('GET /api/v1/shops/:shopId/products returns out-of-stock products when includeOutOfStock=true', async () => {
      const res = await request(app)
        .get(`/api/v1/shops/${approvedShopId}/products`)
        .query({ includeOutOfStock: 'true' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const productIds = res.body.data.map((p: any) => p.id);
      expect(productIds).toContain(outOfStockProductId);
    });
  });

  describe('Order Placement & Server-Side Pricing (Security Doc §3)', () => {
    let createdOrderId = '';

    it('places an order end-to-end with authoritative server-computed total', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1InRadiusAddressId,
          items: [
            { productId: inStockProduct1Id, quantity: 2 }, // 2 * 6000 = 12000 paise
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.status).toBe(OrderStatus.PLACED);
      expect(res.body.data.subtotal).toBe(12000);
      expect(res.body.data.deliveryFee).toBeGreaterThan(0);
      expect(res.body.data.total).toBe(res.body.data.subtotal + res.body.data.deliveryFee);

      // Verify payment was initialized as COD PENDING
      expect(res.body.data.payment).not.toBeNull();
      expect(res.body.data.payment.status).toBe('PENDING');

      // Verify immutable snapshot
      expect(res.body.data.items[0].unitPriceAtOrder).toBe(6000);

      createdOrderId = res.body.data.id;
    });

    it('rejects order payload containing client-provided price tampering fields', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1InRadiusAddressId,
          items: [{ productId: inStockProduct1Id, quantity: 1 }],
          price: 1, // Forgery attempt
          total: 1, // Forgery attempt
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    });

    it('rejects order when customer delivery address is outside shop delivery radius', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1OutOfRadiusAddressId, // Electronic City (outside 5km)
          items: [{ productId: inStockProduct1Id, quantity: 1 }],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.SHOP_OUT_OF_RANGE);
    });

    it('rejects order if any requested item is out of stock', async () => {
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1InRadiusAddressId,
          items: [
            { productId: inStockProduct1Id, quantity: 1 },
            { productId: outOfStockProductId, quantity: 1 }, // inStock: false
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.PRODUCT_OUT_OF_STOCK);
    });

    it('supports idempotencyKey to prevent duplicate order submissions (Security Doc §3)', async () => {
      const idempotencyKey = `idem_${Date.now()}`;

      const res1 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1InRadiusAddressId,
          items: [{ productId: inStockProduct1Id, quantity: 1 }],
          idempotencyKey,
        });

      expect(res1.status).toBe(201);

      // Submit identical request with same idempotency key
      const res2 = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shopId: approvedShopId,
          deliveryAddressId: customer1InRadiusAddressId,
          items: [{ productId: inStockProduct1Id, quantity: 1 }],
          idempotencyKey,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.id).toBe(res1.body.data.id);
    });

    describe('Order Details, Polling, & Ownership Checks', () => {
      it('GET /api/v1/orders/:id returns order details to the owning customer', async () => {
        const res = await request(app)
          .get(`/api/v1/orders/${createdOrderId}`)
          .set('Authorization', `Bearer ${customer1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(createdOrderId);
      });

      it('GET /api/v1/orders/:id blocks a different customer with 403 FORBIDDEN_RESOURCE', async () => {
        const res = await request(app)
          .get(`/api/v1/orders/${createdOrderId}`)
          .set('Authorization', `Bearer ${customer2Token}`); // Wrong customer!

        expect(res.status).toBe(403);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe(ApiErrorCode.FORBIDDEN_RESOURCE);
      });

      it('GET /api/v1/orders/:id/status provides lightweight polling fallback', async () => {
        const res = await request(app)
          .get(`/api/v1/orders/${createdOrderId}/status`)
          .set('Authorization', `Bearer ${customer1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.orderId).toBe(createdOrderId);
        expect(res.body.data.status).toBe(OrderStatus.PLACED);
        expect(res.body.data).toHaveProperty('updatedAt');
      });

      it('POST /api/v1/orders/:id/cancel allows customer to cancel PLACED order', async () => {
        const res = await request(app)
          .post(`/api/v1/orders/${createdOrderId}/cancel`)
          .set('Authorization', `Bearer ${customer1Token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe(OrderStatus.CANCELLED);
      });

      it('POST /api/v1/orders/:id/rating rejects rating for non-DELIVERED order', async () => {
        const res = await request(app)
          .post(`/api/v1/orders/${createdOrderId}/rating`)
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({ stars: 5, comment: 'Great service' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
      });
    });
  });
});
