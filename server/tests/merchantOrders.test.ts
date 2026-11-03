/**
 * Merchant Order Management — Integration Tests
 * Tests: shop creation, order inbox, state machine transitions, ownership enforcement.
 * Requires: Postgres running at DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { ShopStatus, OrderStatus, Role, PaymentMethod, PaymentStatus } from '@shopright/shared-types';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

let merchantToken: string;
let otherMerchantToken: string;
let customerToken: string;

let merchantId: string;
let otherMerchantId: string;
let customerId: string;

let shopId: string;
let productId: string;
let orderId: string;
let addressId: string;

const FEE_RULE = { baseFee: 3000, perKmFee: 1000, freeDeliveryThreshold: 50000 };

beforeAll(async () => {
  // Clear test data
  await prisma.rating.deleteMany({ where: { customer: { email: { contains: 'merchanttest' } } } });
  await prisma.orderItem.deleteMany({ where: { order: { customer: { email: { contains: 'merchanttest' } } } } });
  await prisma.payment.deleteMany({ where: { order: { customer: { email: { contains: 'merchanttest' } } } } });
  await prisma.order.deleteMany({ where: { customer: { email: { contains: 'merchanttest' } } } });
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'merchanttest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'merchanttest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'merchanttest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'merchanttest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'merchanttest' } } });

  // 1. Register merchant
  const m1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test Merchant', email: 'merchant1@merchanttest.local', phone: '9000000001', password: 'Password123!', role: Role.SHOPKEEPER });
  merchantToken = m1.body.data.accessToken;
  merchantId = m1.body.data.user.id;

  // 2. Register another merchant (for ownership tests)
  const m2 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Other Merchant', email: 'merchant2@merchanttest.local', phone: '9000000002', password: 'Password123!', role: Role.SHOPKEEPER });
  otherMerchantToken = m2.body.data.accessToken;
  otherMerchantId = m2.body.data.user.id;

  // 3. Register customer
  const c1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Test Customer', email: 'customer1@merchanttest.local', phone: '9000000003', password: 'Password123!', role: Role.CUSTOMER });
  customerToken = c1.body.data.accessToken;
  customerId = c1.body.data.user.id;

  // 4. Create shop via merchant API (starts PENDING, admin approves it below)
  const shopRes = await request(app)
    .post('/api/v1/merchant/shops')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({
      name: 'Merchant Test Shop',
      description: 'A test shop for merchant tests',
      category: 'groceries',
      lat: 12.9716,
      lng: 77.5946,
      address: '123 Test Street, Bangalore',
      serviceRadiusKm: 10,
    });
  shopId = shopRes.body.data.id;

  // Admin-approve the shop directly in DB for test setup
  await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.APPROVED } });

  // 5. Create product
  const prodRes = await request(app)
    .post('/api/v1/merchant/products')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({
      shopId,
      name: 'Test Rice',
      description: 'Premium basmati rice for merchant tests',
      price: 8000, // ₹80 in paise
      unit: 'kg',
      imageUrl: 'https://example.com/rice.jpg',
      inStock: true,
    });
  productId = prodRes.body.data.id;

  // 6. Create customer address
  const addrRes = await request(app)
    .post('/api/v1/addresses')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ label: 'Home', line1: '456 Customer Ave', city: 'Bangalore', lat: 12.975, lng: 77.595 });
  addressId = addrRes.body.data.id;

  // 7. Ensure a fee rule exists
  const existingRule = await prisma.deliveryFeeRule.findFirst({ orderBy: { effectiveFrom: 'desc' } });
  if (!existingRule) {
    await prisma.deliveryFeeRule.create({ data: FEE_RULE });
  }

  // 8. Place an order as customer
  const orderRes = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ shopId, deliveryAddressId: addressId, items: [{ productId, quantity: 2 }] });
  orderId = orderRes.body.data.id;
});

afterAll(async () => {
  await prisma.rating.deleteMany({ where: { customer: { email: { contains: 'merchanttest' } } } });
  await prisma.orderItem.deleteMany({ where: { order: { customer: { email: { contains: 'merchanttest' } } } } });
  await prisma.payment.deleteMany({ where: { order: { customer: { email: { contains: 'merchanttest' } } } } });
  await prisma.order.deleteMany({ where: { customer: { email: { contains: 'merchanttest' } } } });
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'merchanttest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'merchanttest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'merchanttest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'merchanttest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'merchanttest' } } });
  await prisma.$disconnect();
});

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('Merchant — Shop & Product Management', () => {
  it('POST /merchant/shops creates a shop in PENDING status', async () => {
    const res = await request(app)
      .post('/api/v1/merchant/shops')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        name: 'Second Shop',
        description: 'A second shop for testing list',
        category: 'pharmacy',
        lat: 12.9720,
        lng: 77.5950,
        address: '789 Shop Lane',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(ShopStatus.PENDING);
    expect(res.body.data.ownerId).toBe(merchantId);
  });

  it('GET /merchant/shops returns only the authenticated merchant\'s own shops', async () => {
    const res = await request(app)
      .get('/api/v1/merchant/shops')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((s: any) => s.ownerId);
    expect(ids.every((id: string) => id === merchantId)).toBe(true);
  });

  it('GET /merchant/shops does NOT return other merchants\' shops', async () => {
    const res = await request(app)
      .get('/api/v1/merchant/shops')
      .set('Authorization', `Bearer ${otherMerchantToken}`);
    expect(res.status).toBe(200);
    const shopIds = res.body.data.map((s: any) => s.id);
    expect(shopIds).not.toContain(shopId);
  });

  it('rejects shop creation without authentication (401)', async () => {
    const res = await request(app)
      .post('/api/v1/merchant/shops')
      .send({ name: 'Ghost Shop', description: 'Unauthorized shop attempt', category: 'misc', lat: 0, lng: 0, address: '---' });
    expect(res.status).toBe(401);
  });

  it('CUSTOMER role cannot access merchant routes (403)', async () => {
    const res = await request(app)
      .post('/api/v1/merchant/shops')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ name: 'Hack Shop', description: 'Customer trying merchant route', category: 'misc', lat: 0, lng: 0, address: '---' });
    expect(res.status).toBe(403);
  });

  it('POST /merchant/products creates a product for owned shop', async () => {
    const res = await request(app)
      .post('/api/v1/merchant/products')
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({
        shopId,
        name: 'Test Dal',
        description: 'Yellow moong dal for testing purposes',
        price: 12000,
        unit: 'kg',
        imageUrl: 'https://example.com/dal.jpg',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.shopId).toBe(shopId);
    expect(res.body.data.price).toBe(12000);
  });

  it('cannot create a product for a shop owned by another merchant (403)', async () => {
    const res = await request(app)
      .post('/api/v1/merchant/products')
      .set('Authorization', `Bearer ${otherMerchantToken}`)
      .send({
        shopId,
        name: 'Stolen Product',
        description: 'Attempting to create product in another merchant shop',
        price: 5000,
        unit: 'kg',
        imageUrl: 'https://example.com/img.jpg',
      });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('PATCH /merchant/products/:id updates name and price', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/products/${productId}`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ name: 'Premium Rice', price: 9500 });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Premium Rice');
    expect(res.body.data.price).toBe(9500);
  });

  it('cannot update another merchant\'s product (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/products/${productId}`)
      .set('Authorization', `Bearer ${otherMerchantToken}`)
      .send({ price: 100 });
    expect(res.status).toBe(403);
  });

  it('PATCH /merchant/products/:id/stock toggles inStock flag', async () => {
    const off = await request(app)
      .patch(`/api/v1/merchant/products/${productId}/stock`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ inStock: false });
    expect(off.status).toBe(200);
    expect(off.body.data.inStock).toBe(false);

    const on = await request(app)
      .patch(`/api/v1/merchant/products/${productId}/stock`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ inStock: true });
    expect(on.status).toBe(200);
    expect(on.body.data.inStock).toBe(true);
  });

  it('rejects invalid stock toggle body (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/products/${productId}/stock`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ inStock: 'yes' }); // must be boolean
    expect(res.status).toBe(400);
  });
});

describe('Merchant — Order Inbox & State Transitions', () => {
  it('GET /merchant/shops/:shopId/orders returns orders for owned shop', async () => {
    const res = await request(app)
      .get(`/api/v1/merchant/shops/${shopId}/orders`)
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('cannot view orders of a shop owned by another merchant (403)', async () => {
    const res = await request(app)
      .get(`/api/v1/merchant/shops/${shopId}/orders`)
      .set('Authorization', `Bearer ${otherMerchantToken}`);
    expect(res.status).toBe(403);
  });

  it('PATCH status ACCEPT transitions PLACED → ACCEPTED', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'ACCEPT' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.ACCEPTED);
  });

  it('cannot ACCEPT an already-ACCEPTED order (409 INVALID_STATE_TRANSITION)', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'ACCEPT' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('PATCH status START_PREPARING transitions ACCEPTED → PREPARING', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'START_PREPARING' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.PREPARING);
  });

  it('PATCH status MARK_READY transitions PREPARING → READY', async () => {
    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'MARK_READY' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.READY);
  });

  it('cannot use an invalid event name (400)', async () => {
    // Place another order for this sub-test
    const addr2Res = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ label: 'Work', line1: '999 Office Rd', city: 'Bangalore', lat: 12.976, lng: 77.595 });
    const addr2Id = addr2Res.body.data.id;
    const ord2Res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shopId, deliveryAddressId: addr2Id, items: [{ productId, quantity: 1 }] });
    const ord2Id = ord2Res.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${ord2Id}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'DELIVER' }); // only delivery partners can do this
    expect(res.status).toBe(400); // Invalid enum value (Zod)
  });

  it('another merchant cannot change status of another\'s order (403)', async () => {
    const addr3Res = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ label: 'Other', line1: '555 Side St', city: 'Bangalore', lat: 12.976, lng: 77.595 });
    const addr3Id = addr3Res.body.data.id;
    const ord3Res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shopId, deliveryAddressId: addr3Id, items: [{ productId, quantity: 1 }] });
    const ord3Id = ord3Res.body.data.id;

    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${ord3Id}/status`)
      .set('Authorization', `Bearer ${otherMerchantToken}`)
      .send({ event: 'ACCEPT' });
    expect(res.status).toBe(403);
  });

  it('cannot REJECT a READY order (409)', async () => {
    // orderId is now READY — trying to REJECT should fail
    const res = await request(app)
      .patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${merchantToken}`)
      .send({ event: 'REJECT' });
    expect(res.status).toBe(409);
  });
});

