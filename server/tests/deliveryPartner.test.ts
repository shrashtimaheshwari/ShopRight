/**
 * Delivery Partner — Integration Tests
 * Tests: availability toggle, location update, pickup/deliver transitions, ownership enforcement.
 * Requires: Postgres running at DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { ShopStatus, OrderStatus, Role } from '@shopright/shared-types';

let partnerToken: string;
let otherPartnerToken: string;
let merchantToken: string;
let customerToken: string;

let partnerId: string;
let otherPartnerId: string;
let shopId: string;
let productId: string;
let addressId: string;
let orderId: string;

beforeAll(async () => {
  // Clean up
  await prisma.rating.deleteMany({ where: { customer: { email: { contains: 'delivtest' } } } });
  await prisma.orderItem.deleteMany({ where: { order: { customer: { email: { contains: 'delivtest' } } } } });
  await prisma.payment.deleteMany({ where: { order: { customer: { email: { contains: 'delivtest' } } } } });
  await prisma.order.deleteMany({ where: { customer: { email: { contains: 'delivtest' } } } });
  await prisma.deliveryPartnerProfile.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'delivtest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'delivtest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'delivtest' } } });

  // Register delivery partner
  const p1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Partner A', email: 'partner1@delivtest.local', phone: '9100000001', password: 'Password123!', role: Role.DELIVERY_PARTNER });
  partnerToken = p1.body.data.accessToken;
  partnerId = p1.body.data.user.id;

  // Register another delivery partner
  const p2 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'Partner B', email: 'partner2@delivtest.local', phone: '9100000002', password: 'Password123!', role: Role.DELIVERY_PARTNER });
  otherPartnerToken = p2.body.data.accessToken;
  otherPartnerId = p2.body.data.user.id;

  // Register merchant
  const m1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'DT Merchant', email: 'merchant@delivtest.local', phone: '9100000003', password: 'Password123!', role: Role.SHOPKEEPER });
  merchantToken = m1.body.data.accessToken;

  // Register customer
  const c1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'DT Customer', email: 'customer@delivtest.local', phone: '9100000004', password: 'Password123!', role: Role.CUSTOMER });
  customerToken = c1.body.data.accessToken;

  // Create and approve shop
  const shopRes = await request(app)
    .post('/api/v1/merchant/shops')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({ name: 'DT Shop', description: 'Delivery test shop with goods', category: 'groceries', lat: 12.9716, lng: 77.5946, address: '1 DT Lane', serviceRadiusKm: 10 });
  shopId = shopRes.body.data.id;
  await prisma.shop.update({ where: { id: shopId }, data: { status: ShopStatus.APPROVED } });

  // Create product
  const prodRes = await request(app)
    .post('/api/v1/merchant/products')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({ shopId, name: 'DT Rice', description: 'Delivery test rice product', price: 5000, unit: 'kg', imageUrl: 'https://example.com/r.jpg' });
  productId = prodRes.body.data.id;

  // Customer address
  const addrRes = await request(app)
    .post('/api/v1/addresses')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ label: 'Home', line1: '1 Customer St', city: 'BLR', lat: 12.975, lng: 77.595 });
  addressId = addrRes.body.data.id;

  // Place order
  const orderRes = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${customerToken}`)
    .send({ shopId, deliveryAddressId: addressId, items: [{ productId, quantity: 1 }] });
  orderId = orderRes.body.data.id;

  // Advance order to READY (so delivery partner can act)
  const merchantShopToken = merchantToken; // reuse for merchant ops
  await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`).set('Authorization', `Bearer ${merchantShopToken}`).send({ event: 'ACCEPT' });
  await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`).set('Authorization', `Bearer ${merchantShopToken}`).send({ event: 'START_PREPARING' });
  await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${orderId}/status`).set('Authorization', `Bearer ${merchantShopToken}`).send({ event: 'MARK_READY' });

  // Manually assign the order to partner1
  await prisma.order.update({ where: { id: orderId }, data: { deliveryPartnerId: partnerId } });
});

afterAll(async () => {
  await prisma.rating.deleteMany({ where: { customer: { email: { contains: 'delivtest' } } } });
  await prisma.orderItem.deleteMany({ where: { order: { customer: { email: { contains: 'delivtest' } } } } });
  await prisma.payment.deleteMany({ where: { order: { customer: { email: { contains: 'delivtest' } } } } });
  await prisma.order.deleteMany({ where: { customer: { email: { contains: 'delivtest' } } } });
  await prisma.deliveryPartnerProfile.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'delivtest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'delivtest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'delivtest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'delivtest' } } });
  await prisma.$disconnect();
});

describe('Delivery Partner — Availability & Location', () => {
  it('PATCH /delivery/availability toggles on with location', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/availability')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ isAvailable: true, lat: 12.9720, lng: 77.5960 });
    expect(res.status).toBe(200);
    expect(res.body.data.isAvailable).toBe(true);
    expect(res.body.data.currentLat).toBeCloseTo(12.9720);
    expect(res.body.data.currentLng).toBeCloseTo(77.5960);
  });

  it('PATCH /delivery/availability toggles off', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/availability')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ isAvailable: false });
    expect(res.status).toBe(200);
    expect(res.body.data.isAvailable).toBe(false);
  });

  it('PATCH /delivery/location updates GPS coordinates', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/location')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ lat: 12.9800, lng: 77.5900 });
    expect(res.status).toBe(200);
    expect(res.body.data.currentLat).toBeCloseTo(12.9800);
  });

  it('rejects invalid location (lat out of range)', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/location')
      .set('Authorization', `Bearer ${partnerToken}`)
      .send({ lat: 999, lng: 77.59 }); // invalid lat
    expect(res.status).toBe(400);
  });

  it('CUSTOMER cannot access delivery routes (403)', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/availability')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ isAvailable: true });
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request(app)
      .patch('/api/v1/delivery/availability')
      .send({ isAvailable: true });
    expect(res.status).toBe(401);
  });
});

describe('Delivery Partner — Order Actions', () => {
  it('GET /delivery/orders returns assigned orders', async () => {
    const res = await request(app)
      .get('/api/v1/delivery/orders')
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.map((o: any) => o.id);
    expect(ids).toContain(orderId);
  });

  it('POST /delivery/orders/:id/pickup transitions READY → PICKED_UP', async () => {
    const res = await request(app)
      .post(`/api/v1/delivery/orders/${orderId}/pickup`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.PICKED_UP);
  });

  it('cannot pickup the same order twice (409 INVALID_STATE_TRANSITION)', async () => {
    const res = await request(app)
      .post(`/api/v1/delivery/orders/${orderId}/pickup`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(409);
  });

  it('another delivery partner cannot pickup an order assigned to someone else (403)', async () => {
    // Place a new order and advance to READY
    const addrRes = await request(app)
      .post('/api/v1/addresses')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ label: 'Work', line1: '2 Work Rd', city: 'BLR', lat: 12.976, lng: 77.596 });
    const newOrderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shopId, deliveryAddressId: addrRes.body.data.id, items: [{ productId, quantity: 1 }] });
    const newOrderId = newOrderRes.body.data.id;

    // Advance to READY
    await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${newOrderId}/status`).set('Authorization', `Bearer ${merchantToken}`).send({ event: 'ACCEPT' });
    await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${newOrderId}/status`).set('Authorization', `Bearer ${merchantToken}`).send({ event: 'START_PREPARING' });
    await request(app).patch(`/api/v1/merchant/shops/${shopId}/orders/${newOrderId}/status`).set('Authorization', `Bearer ${merchantToken}`).send({ event: 'MARK_READY' });
    // Assign to partner1
    await prisma.order.update({ where: { id: newOrderId }, data: { deliveryPartnerId: partnerId } });

    // Partner2 tries to pickup — must be blocked
    const res = await request(app)
      .post(`/api/v1/delivery/orders/${newOrderId}/pickup`)
      .set('Authorization', `Bearer ${otherPartnerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_ASSIGNED_PARTNER');
  });

  it('POST /delivery/orders/:id/deliver transitions PICKED_UP → DELIVERED', async () => {
    const res = await request(app)
      .post(`/api/v1/delivery/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(OrderStatus.DELIVERED);
  });

  it('cannot deliver an already-delivered order (409)', async () => {
    const res = await request(app)
      .post(`/api/v1/delivery/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${partnerToken}`);
    expect(res.status).toBe(409);
  });
});

