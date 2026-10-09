import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

describe('Health Check Endpoints', () => {
  describe('GET /health/live (Liveness Probe)', () => {
    it('returns 200 with status ok when process is alive', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        success: true,
        data: {
          status: 'ok',
        },
      });
    });

    it('returns 200 even if database connection fails (independence check)', async () => {
      const app = buildApp();
      const querySpy = vi
        .spyOn(pool, 'query')
        .mockRejectedValueOnce(new Error('Database is completely down'));

      const res = await app.inject({
        method: 'GET',
        url: '/health/live',
      });

      querySpy.mockRestore();

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready (Readiness Probe)', () => {
    it('returns 200 with status ok when database is healthy', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        success: true,
        data: {
          status: 'ok',
        },
      });
    });

    it('returns 503 SERVICE_UNAVAILABLE when database readiness query fails', async () => {
      const app = buildApp();
      const querySpy = vi
        .spyOn(pool, 'query')
        .mockRejectedValueOnce(new Error('Connection failure'));

      const res = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });

      querySpy.mockRestore();

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service Unavailable',
          details: [],
        },
      });
    });
  });

  describe('GET /health (Legacy / Backward Compatibility)', () => {
    it('returns 200 with status ok when database is healthy', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toEqual({
        success: true,
        data: {
          status: 'ok',
        },
      });
    });

    it('returns 503 SERVICE_UNAVAILABLE when database query fails', async () => {
      const app = buildApp();
      const querySpy = vi
        .spyOn(pool, 'query')
        .mockRejectedValueOnce(new Error('Connection failure'));

      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      querySpy.mockRestore();

      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body).toEqual({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Service Unavailable',
          details: [],
        },
      });
    });
  });
});
