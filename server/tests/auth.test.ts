import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Role, ApiErrorCode } from '@shopright/shared-types';
import { createApp } from '../src/app.js';
import { prisma } from '../src/prisma.js';
import { hashPassword, comparePassword } from '../src/modules/auth/tokenService.js';

describe('Auth Subsystem & Security Guards', () => {
  const app = createApp();
  const testCustomerEmail = `customer_${Date.now()}@example.com`;
  const testPartnerEmail = `partner_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  let customerAccessToken = '';
  let customerRefreshToken = '';

  beforeAll(async () => {
    // Clean up any test records if existing
    await prisma.user.deleteMany({
      where: {
        email: { in: [testCustomerEmail, testPartnerEmail, 'admin_attempt@example.com'] },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        email: { in: [testCustomerEmail, testPartnerEmail, 'admin_attempt@example.com'] },
      },
    });
    await prisma.$disconnect();
  });

  describe('Password Hashing (Security Doc §2)', () => {
    it('hashes password with bcrypt cost factor >= 12 and verifies correctly', async () => {
      const hash = await hashPassword(testPassword);
      expect(hash).toMatch(/^\$2[aby]\$12\$/); // Confirms bcrypt cost factor 12

      const isValid = await comparePassword(testPassword, hash);
      expect(isValid).toBe(true);

      const isInvalid = await comparePassword('WrongPassword', hash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('Registration (API Doc §2 & Security Doc §2)', () => {
    it('successfully registers a CUSTOMER user and issues tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Jane Customer',
          email: testCustomerEmail,
          phone: '+919876543210',
          password: testPassword,
          role: Role.CUSTOMER,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testCustomerEmail);
      expect(res.body.data.user.role).toBe(Role.CUSTOMER);
      expect(res.body.data.user).not.toHaveProperty('passwordHash');

      customerAccessToken = res.body.data.accessToken;
      customerRefreshToken = res.body.data.refreshToken;
    });

    it('successfully registers a DELIVERY_PARTNER and creates a delivery profile', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Dave Delivery',
          email: testPartnerEmail,
          phone: '+919876543211',
          password: testPassword,
          role: Role.DELIVERY_PARTNER,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify associated DeliveryPartnerProfile was created
      const profile = await prisma.deliveryPartnerProfile.findFirst({
        where: { user: { email: testPartnerEmail } },
      });
      expect(profile).not.toBeNull();
      expect(profile?.isAvailable).toBe(false);
    });

    it('rejects public self-registration as ADMIN with 403 FORBIDDEN_ROLE', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Malicious Admin',
          email: 'admin_attempt@example.com',
          phone: '+919876543219',
          password: testPassword,
          role: Role.ADMIN,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.FORBIDDEN_ROLE);
      expect(res.body.error.message).toContain('ADMIN accounts cannot be self-registered');
    });

    it('rejects duplicate email registration with 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          name: 'Duplicate Jane',
          email: testCustomerEmail,
          phone: '+919876543210',
          password: testPassword,
          role: Role.CUSTOMER,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    });
  });

  describe('Login & Token Issuance', () => {
    it('authenticates valid credentials and returns fresh tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testCustomerEmail,
          password: testPassword,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user.email).toBe(testCustomerEmail);
    });

    it('rejects incorrect password with 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testCustomerEmail,
          password: 'IncorrectPassword',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.INVALID_CREDENTIALS);
    });

    it('rejects unregistered email with 401 INVALID_CREDENTIALS', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'unknown_user_12345@example.com',
          password: testPassword,
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.INVALID_CREDENTIALS);
    });
  });

  describe('Token Refresh & Revocation (Security Doc §2 & ADR-005)', () => {
    it('refreshes access token and rotates refresh token successfully', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: customerRefreshToken });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');

      // Update customer tokens with rotated values
      customerAccessToken = res.body.data.accessToken;
      customerRefreshToken = res.body.data.refreshToken;
    });

    it('revokes refresh token on logout and rejects subsequent refresh attempts', async () => {
      // 1. Logout with current refresh token
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken: customerRefreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // 2. Attempting to refresh with the revoked token must fail
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: customerRefreshToken });

      expect(refreshRes.status).toBe(401);
      expect(refreshRes.body.success).toBe(false);
      expect(refreshRes.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED);
    });
  });

  describe('Profile & Auth Guards', () => {
    it('GET /api/v1/auth/me returns current user with valid Bearer token', async () => {
      // First login to obtain fresh access token
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testCustomerEmail,
          password: testPassword,
        });

      const token = loginRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(testCustomerEmail);
      expect(res.body.data.role).toBe(Role.CUSTOMER);
    });

    it('GET /api/v1/auth/me fails with 401 when Authorization header is missing', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED);
    });

    it('GET /api/v1/auth/me fails with 401 when token is invalid or forged', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer forged_invalid_jwt_token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED);
    });
  });

  describe('Role-Based Guards (Security Doc §2)', () => {
    it('requireRole blocks unauthorized role with 403 FORBIDDEN_ROLE and allows permitted role', async () => {
      const { requireRole } = await import('../src/modules/auth/authMiddleware.js');
      const shopkeeperGuard = requireRole(Role.SHOPKEEPER);

      // 1. Customer attempting shopkeeper resource throws 403 FORBIDDEN_ROLE
      const customerReq = {
        user: { sub: 'c1', role: Role.CUSTOMER, email: 'c@example.com' },
      } as any;

      expect(() => {
        shopkeeperGuard(customerReq, {} as any, () => {});
      }).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: ApiErrorCode.FORBIDDEN_ROLE,
        })
      );

      // 2. Shopkeeper accessing shopkeeper resource
      const shopkeeperReq = {
        user: { sub: 's1', role: Role.SHOPKEEPER, email: 's@example.com' },
      } as any;
      let nextCalled = false;

      shopkeeperGuard(shopkeeperReq, {} as any, (err?: any) => {
        expect(err).toBeUndefined();
        nextCalled = true;
      });

      expect(nextCalled).toBe(true);
    });
  });

  describe('Google Sign-In & OAuth Guards', () => {
    it('rejects Google auth when idToken is missing (400 VALIDATION_ERROR)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.VALIDATION_ERROR);
    });

    it('rejects Google auth attempting to register as ADMIN (403 FORBIDDEN_ROLE)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          idToken: 'fake-google-token',
          role: Role.ADMIN,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.FORBIDDEN_ROLE);
    });

    it('rejects an invalid/unverifiable Google idToken with 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .post('/api/v1/auth/google')
        .send({
          idToken: 'invalid.google.jwt.token',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe(ApiErrorCode.UNAUTHORIZED);
    });
  });
});
