/**
 * Admin Console — Integration Tests
 * Tests: shop approval/rejection/suspension, fee rule versioning, analytics, role enforcement.
 * Requires: Postgres running at DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { ShopStatus, Role } from '@shopright/shared-types';

let adminToken: string;
let merchantToken: string;
let customerToken: string;
let shopId: string;

beforeAll(async () => {
  // Clean test data
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'admintest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'admintest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'admintest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'admintest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'admintest' } } });

  // Register admin (direct DB insert since register endpoint blocks ADMIN)
  const { hashPassword } = await import('../src/modules/auth/tokenService.js');
  const adminUser = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@admintest.local',
      phone: '9200000001',
      passwordHash: await hashPassword('Password123!'),
      role: Role.ADMIN,
    },
  });

  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@admintest.local', password: 'Password123!' });
  adminToken = adminLogin.body.data.accessToken;

  // Register merchant and customer
  const m1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'AT Merchant', email: 'merchant@admintest.local', phone: '9200000002', password: 'Password123!', role: Role.SHOPKEEPER });
  merchantToken = m1.body.data.accessToken;

  const c1 = await request(app)
    .post('/api/v1/auth/register')
    .send({ name: 'AT Customer', email: 'customer@admintest.local', phone: '9200000003', password: 'Password123!', role: Role.CUSTOMER });
  customerToken = c1.body.data.accessToken;

  // Create a PENDING shop
  const shopRes = await request(app)
    .post('/api/v1/merchant/shops')
    .set('Authorization', `Bearer ${merchantToken}`)
    .send({ name: 'Admin Test Shop', description: 'A shop pending admin review right now', category: 'pharmacy', lat: 12.9716, lng: 77.5946, address: '1 Admin Lane' });
  shopId = shopRes.body.data.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { shop: { owner: { email: { contains: 'admintest' } } } } });
  await prisma.shop.deleteMany({ where: { owner: { email: { contains: 'admintest' } } } });
  await prisma.address.deleteMany({ where: { user: { email: { contains: 'admintest' } } } });
  await prisma.refreshToken.deleteMany({ where: { user: { email: { contains: 'admintest' } } } });
  await prisma.user.deleteMany({ where: { email: { contains: 'admintest' } } });
  await prisma.$disconnect();
});

describe('Admin — Role Enforcement', () => {
  it('CUSTOMER cannot access admin routes (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/shops')
      .set('Authorization', `Bearer ${customerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_ROLE');
  });

  it('SHOPKEEPER cannot access admin routes (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/shops')
      .set('Authorization', `Bearer ${merchantToken}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request is rejected (401)', async () => {
    const res = await request(app).get('/api/v1/admin/shops');
    expect(res.status).toBe(401);
  });
});

describe('Admin — Shop Moderation', () => {
  it('GET /admin/shops lists all shops with owner info', async () => {
    const res = await request(app)
      .get('/api/v1/admin/shops')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find((s: any) => s.id === shopId);
    expect(found).toBeDefined();
    expect(found.owner).toBeDefined();
    expect(found.status).toBe(ShopStatus.PENDING);
  });

  it('GET /admin/shops?status=PENDING filters by status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/shops?status=PENDING')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const allPending = res.body.data.every((s: any) => s.status === ShopStatus.PENDING);
    expect(allPending).toBe(true);
  });

  it('PATCH /admin/shops/:id/approve sets status to APPROVED', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/shops/${shopId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ShopStatus.APPROVED);
  });

  it('PATCH /admin/shops/:id/suspend sets status to SUSPENDED', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/shops/${shopId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ShopStatus.SUSPENDED);
  });

  it('PATCH /admin/shops/:id/reject sets status to REJECTED', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/shops/${shopId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe(ShopStatus.REJECTED);
  });

  it('returns 404 for a non-existent shop', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/shops/nonexistent-id-999/approve')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Admin — Delivery Fee Rules', () => {
  it('POST /admin/fee-rules creates a new versioned fee rule', async () => {
    const res = await request(app)
      .post('/api/v1/admin/fee-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ baseFee: 2500, perKmFee: 800, freeDeliveryThreshold: 40000 });
    expect(res.status).toBe(201);
    expect(res.body.data.baseFee).toBe(2500);
    expect(res.body.data.perKmFee).toBe(800);
    expect(res.body.data.freeDeliveryThreshold).toBe(40000);
  });

  it('GET /admin/fee-rules lists all fee rules (newest first)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/fee-rules')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects fee rule with negative baseFee (400)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/fee-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ baseFee: -100, perKmFee: 500, freeDeliveryThreshold: null });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects fee rule with non-integer baseFee (400)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/fee-rules')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ baseFee: 25.50, perKmFee: 800 });
    expect(res.status).toBe(400);
  });
});

describe('Admin — Orders & Analytics', () => {
  it('GET /admin/orders returns all orders with pagination', async () => {
    const res = await request(app)
      .get('/api/v1/admin/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toHaveProperty('total');
    expect(res.body.meta).toHaveProperty('totalPages');
  });

  it('GET /admin/analytics returns system-wide metrics', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('shops');
    expect(res.body.data).toHaveProperty('orders');
    expect(res.body.data).toHaveProperty('revenue');
    expect(res.body.data).toHaveProperty('users');
    expect(typeof res.body.data.shops.total).toBe('number');
    expect(typeof res.body.data.revenue.totalPaise).toBe('number');
  });
});

