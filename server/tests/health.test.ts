import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApiErrorCode } from '@shopright/shared-types';

describe('Health & Error Envelope Endpoints', () => {
  const app = createApp();

  it('GET /health returns 200 and standard success envelope', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('status', 'ok');
    expect(res.body.data).toHaveProperty('service', 'shopright-backend');
    expect(res.body.data).toHaveProperty('timestamp');
  });

  it('GET /api/v1/health returns 200 and standard success envelope', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /non-existent-route returns 404 and standard error envelope', async () => {
    const res = await request(app).get('/non-existent-route');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error.code).toBe(ApiErrorCode.NOT_FOUND);
    expect(res.body.error.message).toContain('not found');
  });
});
