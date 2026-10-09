import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('API Versioning (/api/v1)', () => {
  describe('Health endpoints separation', () => {
    it('serves health endpoints outside of /api/v1', async () => {
      const app = buildApp();

      const resLive = await app.inject({ method: 'GET', url: '/health/live' });
      expect(resLive.statusCode).toBe(200);
      expect(resLive.json()).toEqual({ success: true, data: { status: 'ok' } });

      const resReady = await app.inject({ method: 'GET', url: '/health/ready' });
      expect(resReady.statusCode).toBe(200);
      expect(resReady.json()).toEqual({ success: true, data: { status: 'ok' } });

      const resLegacy = await app.inject({ method: 'GET', url: '/health' });
      expect(resLegacy.statusCode).toBe(200);
      expect(resLegacy.json()).toEqual({ success: true, data: { status: 'ok' } });
    });

    it('returns 404 for /api/v1/health', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('Versioned Authentication & Domain Endpoints', () => {
    it('serves auth validation errors under /api/v1/register with standard envelope', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/register',
        payload: { email: 'invalid-email', password: '123' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('serves auth validation errors under /api/v1/login with standard envelope', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/login',
        payload: { email: 'notfound@example.com', password: 'password123' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('enforces authGuard on /api/v1/examples', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/examples',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('enforces adminGuard on /api/v1/admin/users', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Backward Compatibility with Root-Level Routes', () => {
    it('preserves unversioned /register route alongside /api/v1/register', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'POST',
        url: '/register',
        payload: { email: 'invalid-email', password: '123' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('preserves unversioned /examples route alongside /api/v1/examples', async () => {
      const app = buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/examples',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });
});
