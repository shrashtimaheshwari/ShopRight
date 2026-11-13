/**
 * payments.test.ts
 * Comprehensive test suite for YouPI-PG UPI payment gateway integration.
 *
 * Unit tests (no DB needed — providers mocked or using dev mode):
 *   1. verifyYoupiWebhookSignature — valid HMAC passes, tampered body fails, missing sig fails
 *   2. YouPI webhook event mapping (via HTTP with mocked Prisma)
 *   3. COD payment initiation
 *
 * Integration tests (using Prisma test DB):
 *   4. POST /orders/:id/pay with UPI_QR
 *   5. POST /orders/:id/pay with COD
 *   6. POST /orders/:id/pay unauthorized
 *   7. POST /orders/:id/pay already COMPLETED
 *   8. POST /payments/webhook/youpi — reconciled event → COMPLETED
 *   9. POST /payments/webhook/youpi — invalid HMAC → 401
 *  10. POST /payments/webhook/youpi — unknown paymentId → 200 graceful ack
 */

import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import {
  Role,
  ShopStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '@shopright/shared-types';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { verifyYoupiWebhookSignature } from '../src/modules/payments/youpiProvider.js';

// ─── Helper: compute a valid YouPI HMAC signature ────────────────────────────

const TEST_WEBHOOK_SECRET = 'dev_youpi_webhook_secret_32chars_min';

function signWebhookBody(body: string | Buffer, secret = TEST_WEBHOOK_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(typeof body === 'string' ? Buffer.from(body) : body);
  return `sha256=${hmac.digest('hex')}`;
}

// ─── 1. Unit Tests: verifyYoupiWebhookSignature ───────────────────────────────

describe('verifyYoupiWebhookSignature (unit)', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment.reconciled', data: { paymentId: 'p1' } }));

  it('returns true for a valid HMAC-SHA256 signature', () => {
    const sig = signWebhookBody(body);
    expect(verifyYoupiWebhookSignature(body, sig)).toBe(true);
  });

  it('returns false for a tampered body', () => {
    const sig = signWebhookBody(body);
    const tamperedBody = Buffer.from(JSON.stringify({ event: 'payment.reconciled', data: { paymentId: 'p2' } }));
    expect(verifyYoupiWebhookSignature(tamperedBody, sig)).toBe(false);
  });

  it('returns false for a missing signature (empty string)', () => {
    expect(verifyYoupiWebhookSignature(body, '')).toBe(false);
  });

  it('returns false for a signature without sha256= prefix', () => {
    const hmac = crypto.createHmac('sha256', TEST_WEBHOOK_SECRET).update(body).digest('hex');
    expect(verifyYoupiWebhookSignature(body, hmac)).toBe(false);
  });

  it('returns false for a signature with wrong secret', () => {
    const sig = signWebhookBody(body, 'wrong_secret_1234567890abcdef');
    expect(verifyYoupiWebhookSignature(body, sig)).toBe(false);
  });

  it('returns false for a signature with length mismatch (truncated hex)', () => {
    expect(verifyYoupiWebhookSignature(body, 'sha256=deadbeef')).toBe(false);
  });
});

// ─── 2. COD Provider Unit Test ────────────────────────────────────────────────

describe('CodProvider (unit)', () => {
  it('createPayment returns PENDING status with no providerRef', async () => {
    const { CodProvider } = await import('../src/modules/payments/codProvider.js');
    const provider = new CodProvider();
    const result = await provider.createPayment('order-123', 50000);
    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.providerRef).toBeNull();
  });

  it('verifyPayment always returns true (COD verified on delivery)', async () => {
    const { CodProvider } = await import('../src/modules/payments/codProvider.js');
    const provider = new CodProvider();
    expect(await provider.verifyPayment('order-123')).toBe(true);
  });
});

// ─── 3. YoupiProvider Unit Test (dev mode) ────────────────────────────────────

describe('YoupiProvider dev-mode (unit)', () => {
  it('createPayment returns PENDING with mock checkoutUrl in dev mode', async () => {
    const { YoupiProvider } = await import('../src/modules/payments/youpiProvider.js');
    const provider = new YoupiProvider();
    const result = await provider.createPayment('order-abc123', 100000);
    expect(result.status).toBe(PaymentStatus.PENDING);
    expect(result.providerRef).toMatch(/^mock-session-/);
    expect((result as { checkoutUrl?: string }).checkoutUrl).toMatch(/pay\.dev\.local/);
    expect((result as { expiresAt?: Date }).expiresAt).toBeInstanceOf(Date);
  });

  it('verifyPayment returns true for any non-empty providerRef in dev mode', async () => {
    const { YoupiProvider } = await import('../src/modules/payments/youpiProvider.js');
    const provider = new YoupiProvider();
    expect(await provider.verifyPayment('order-abc', 'some-session-id')).toBe(true);
    expect(await provider.verifyPayment('order-abc', '')).toBe(false);
  });
});

// ─── Integration Tests: require DB ───────────────────────────────────────────

describe('Payment Integration Tests', () => {
  const app = createApp();

  // Test state
  let customerToken = '';
  let customerId = '';
  let customer2Token = '';
  let customer2Id = '';
  let shopkeeperId = '';
  let shopId = '';
  let orderId = '';
  let completedOrderId = '';

  beforeAll(async () => {
    // Create shopkeeper
    const shopkeeper = await prisma.user.create({
      data: {
        name: 'Payment Test Shopkeeper',
        email: `pay_sk_${Date.now()}@example.com`,
        phone: '+919000000001',
        passwordHash: 'hash',
        role: Role.SHOPKEEPER,
      },
    });
    shopkeeperId = shopkeeper.id;

    // Create shop
    const shop = await prisma.shop.create({
      data: {
        ownerId: shopkeeperId,
        name: 'Pay Test Shop',
        description: 'For payment tests',
        category: 'Groceries',
        lat: 12.9716,
        lng: 77.5946,
        address: 'Bangalore',
        status: ShopStatus.APPROVED,
        serviceRadiusKm: 10.0,
      },
    });
    shopId = shop.id;

    // Create product
    const product = await prisma.product.create({
      data: {
        shopId: shop.id,
        name: 'Pay Test Rice',
        description: 'Test rice',
        price: 10000,
        unit: 'kg',
        imageUrl: 'http://example.com/rice.jpg',
        inStock: true,
      },
    });

    // Create delivery fee rule
    await prisma.deliveryFeeRule.create({
      data: { baseFee: 3000, perKmFee: 1000, freeDeliveryThreshold: 50000 },
    });

    // Create customer 1 and get token
    const regRes1 = await request(app)
      .post('/auth/register')
      .send({
        name: 'Pay Customer',
        email: `pay_cust_${Date.now()}@example.com`,
        phone: '+919100000001',
        password: 'password123',
        role: Role.CUSTOMER,
      });
    expect(regRes1.status).toBe(201);
    customerToken = regRes1.body.data.accessToken;
    customerId = regRes1.body.data.user.id;

    // Create customer 2
    const regRes2 = await request(app)
      .post('/auth/register')
      .send({
        name: 'Pay Customer Two',
        email: `pay_cust2_${Date.now()}@example.com`,
        phone: '+919200000002',
        password: 'password123',
        role: Role.CUSTOMER,
      });
    expect(regRes2.status).toBe(201);
    customer2Token = regRes2.body.data.accessToken;
    customer2Id = regRes2.body.data.user.id;

    // Create delivery address for customer 1 (within shop radius)
    const addr1 = await prisma.address.create({
      data: {
        userId: customerId,
        label: 'Home',
        line1: 'MG Road',
        city: 'Bangalore',
        lat: 12.975,
        lng: 77.609,
        isDefault: true,
      },
    });

    // Create delivery address for customer 2
    const addr2 = await prisma.address.create({
      data: {
        userId: customer2Id,
        label: 'Home',
        line1: 'MG Road',
        city: 'Bangalore',
        lat: 12.975,
        lng: 77.609,
        isDefault: true,
      },
    });

    // Create order for customer 1
    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopId: shop.id,
        deliveryAddressId: addr1.id,
        items: [{ productId: product.id, quantity: 1 }],
      });
    expect(orderRes.status).toBe(201);
    orderId = orderRes.body.data.id;

    // Create a second order and mark its payment as COMPLETED (for the "already completed" test)
    const orderRes2 = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopId: shop.id,
        deliveryAddressId: addr1.id,
        items: [{ productId: product.id, quantity: 1 }],
      });
    expect(orderRes2.status).toBe(201);
    completedOrderId = orderRes2.body.data.id;
    await prisma.payment.update({
      where: { orderId: completedOrderId },
      data: { status: PaymentStatus.COMPLETED },
    });
  });

  afterAll(async () => {
    // Cleanup: delete test data in dependency order
    await prisma.payment.deleteMany({
      where: { orderId: { in: [orderId, completedOrderId] } },
    });
    await prisma.orderItem.deleteMany({ where: { order: { customerId } } });
    await prisma.order.deleteMany({ where: { customerId } });
    await prisma.address.deleteMany({ where: { userId: { in: [customerId, customer2Id] } } });
    await prisma.product.deleteMany({ where: { shopId } });
    await prisma.shop.deleteMany({ where: { id: shopId } });
    await prisma.user.deleteMany({
      where: { id: { in: [customerId, customer2Id, shopkeeperId] } },
    });
  });

  // ─── 4. POST /orders/:id/pay with UPI_QR ─────────────────────────────────

  it('4. POST /orders/:id/pay with UPI_QR — creates session, returns checkoutUrl, payment is PENDING', async () => {
    const res = await request(app)
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.UPI_QR });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe(PaymentStatus.PENDING);
    expect(res.body.data.method).toBe(PaymentMethod.UPI_QR);
    expect(res.body.data.checkoutUrl).toMatch(/pay\.dev\.local/);
    expect(res.body.data.providerRef).toMatch(/^mock-session-/);
  });

  // ─── 5. POST /orders/:id/pay with COD ────────────────────────────────────

  it('5. POST /orders/:id/pay with COD — payment marked PENDING, method=COD', async () => {
    // Create a fresh order for this test
    const addrRes = await prisma.address.findFirst({ where: { userId: customerId } });
    const productRes = await prisma.product.findFirst({ where: { shopId } });

    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopId,
        deliveryAddressId: addrRes!.id,
        items: [{ productId: productRes!.id, quantity: 1 }],
      });
    const codOrderId = orderRes.body.data.id;

    const res = await request(app)
      .post(`/orders/${codOrderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.COD });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.method).toBe(PaymentMethod.COD);
    expect(res.body.data.status).toBe(PaymentStatus.PENDING);
    expect(res.body.data.providerRef).toBeNull();
  });

  // ─── 6. POST /orders/:id/pay unauthorized (another customer's order) ─────

  it('6. POST /orders/:id/pay — 403 when attempting to pay for another customer\'s order', async () => {
    const res = await request(app)
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${customer2Token}`)
      .send({ method: PaymentMethod.COD });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  // ─── 7. POST /orders/:id/pay already COMPLETED ───────────────────────────

  it('7. POST /orders/:id/pay — 400 when payment is already COMPLETED', async () => {
    const res = await request(app)
      .post(`/orders/${completedOrderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.UPI_QR });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ─── 8. POST /payments/webhook/youpi — payment.reconciled → COMPLETED ────

  it('8. POST /payments/webhook/youpi — reconciled event updates payment to COMPLETED', async () => {
    // First initiate UPI_QR to get a providerRef
    const payRes = await request(app)
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.UPI_QR });
    expect(payRes.status).toBe(200);

    const providerRef = payRes.body.data.providerRef as string;

    const webhookPayload = JSON.stringify({
      event: 'payment.reconciled',
      data: {
        paymentId: providerRef,
        orderId,
        amount: 13000,
        status: 'RECONCILED',
      },
    });

    const sig = signWebhookBody(webhookPayload);

    const res = await request(app)
      .post('/payments/webhook/youpi')
      .set('Content-Type', 'application/json')
      .set('X-YouPI-Signature', sig)
      .send(webhookPayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    // Verify DB updated
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment?.status).toBe(PaymentStatus.COMPLETED);
  });

  // ─── 9. POST /payments/webhook/youpi — invalid HMAC → 401 ────────────────

  it('9. POST /payments/webhook/youpi — invalid HMAC returns 401', async () => {
    const webhookPayload = JSON.stringify({
      event: 'payment.reconciled',
      data: { paymentId: 'fake-id', orderId, amount: 13000, status: 'RECONCILED' },
    });

    const res = await request(app)
      .post('/payments/webhook/youpi')
      .set('Content-Type', 'application/json')
      .set('X-YouPI-Signature', 'sha256=invalidsignature0000000000000000000000000000000000000000000000')
      .send(webhookPayload);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // ─── 10. POST /payments/webhook/youpi — unknown paymentId → 200 ──────────

  it('10. POST /payments/webhook/youpi — unknown paymentId still returns 200 (graceful ack)', async () => {
    const webhookPayload = JSON.stringify({
      event: 'payment.reconciled',
      data: {
        paymentId: 'completely-unknown-session-id',
        orderId: 'nonexistent-order',
        amount: 50000,
        status: 'RECONCILED',
      },
    });

    const sig = signWebhookBody(webhookPayload);

    const res = await request(app)
      .post('/payments/webhook/youpi')
      .set('Content-Type', 'application/json')
      .set('X-YouPI-Signature', sig)
      .send(webhookPayload);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
  });

  // ─── Bonus: payment.failed event sets status to FAILED ───────────────────

  it('Bonus: payment.failed webhook event sets payment to FAILED', async () => {
    // Create a fresh order and initiate UPI
    const addrRes = await prisma.address.findFirst({ where: { userId: customerId } });
    const productRes = await prisma.product.findFirst({ where: { shopId } });

    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopId,
        deliveryAddressId: addrRes!.id,
        items: [{ productId: productRes!.id, quantity: 1 }],
      });
    const failOrderId = orderRes.body.data.id;

    const payRes = await request(app)
      .post(`/orders/${failOrderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.UPI_QR });
    expect(payRes.status).toBe(200);
    const providerRef = payRes.body.data.providerRef as string;

    const webhookPayload = JSON.stringify({
      event: 'payment.failed',
      data: { paymentId: providerRef, orderId: failOrderId, amount: 13000, status: 'FAILED' },
    });
    const sig = signWebhookBody(webhookPayload);

    const res = await request(app)
      .post('/payments/webhook/youpi')
      .set('Content-Type', 'application/json')
      .set('X-YouPI-Signature', sig)
      .send(webhookPayload);

    expect(res.status).toBe(200);
    const payment = await prisma.payment.findFirst({ where: { orderId: failOrderId } });
    expect(payment?.status).toBe(PaymentStatus.FAILED);
  });

  // ─── Bonus: payment.observed_success keeps status PENDING ────────────────

  it('Bonus: payment.observed_success webhook does NOT change payment to COMPLETED (stays PENDING)', async () => {
    const addrRes = await prisma.address.findFirst({ where: { userId: customerId } });
    const productRes = await prisma.product.findFirst({ where: { shopId } });

    const orderRes = await request(app)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shopId,
        deliveryAddressId: addrRes!.id,
        items: [{ productId: productRes!.id, quantity: 1 }],
      });
    const obsOrderId = orderRes.body.data.id;

    const payRes = await request(app)
      .post(`/orders/${obsOrderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: PaymentMethod.UPI_QR });
    expect(payRes.status).toBe(200);
    const providerRef = payRes.body.data.providerRef as string;

    const webhookPayload = JSON.stringify({
      event: 'payment.observed_success',
      data: { paymentId: providerRef, orderId: obsOrderId, amount: 13000, status: 'OBSERVED_SUCCESS' },
    });
    const sig = signWebhookBody(webhookPayload);

    const res = await request(app)
      .post('/payments/webhook/youpi')
      .set('Content-Type', 'application/json')
      .set('X-YouPI-Signature', sig)
      .send(webhookPayload);

    expect(res.status).toBe(200);
    const payment = await prisma.payment.findFirst({ where: { orderId: obsOrderId } });
    // Must still be PENDING — not COMPLETED — until reconciled
    expect(payment?.status).toBe(PaymentStatus.PENDING);
  });

  // ─── Authentication guard ─────────────────────────────────────────────────

  it('POST /orders/:id/pay without token returns 401', async () => {
    const res = await request(app)
      .post(`/orders/${orderId}/pay`)
      .send({ method: PaymentMethod.UPI_QR });
    expect(res.status).toBe(401);
  });

  it('POST /orders/:id/pay with invalid method returns 400', async () => {
    const res = await request(app)
      .post(`/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ method: 'BITCOIN' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
