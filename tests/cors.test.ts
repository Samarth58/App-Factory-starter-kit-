import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { parseAllowedOrigins } from '../src/plugins/cors.js';

describe('CORS Plugin Integration', () => {
  describe('parseAllowedOrigins helper', () => {
    it('parses comma-separated string into trimmed array', () => {
      const parsed = parseAllowedOrigins('http://localhost:3000, http://localhost:5173, https://example.com ');
      expect(parsed).toEqual([
        'http://localhost:3000',
        'http://localhost:5173',
        'https://example.com',
      ]);
    });

    it('handles empty input gracefully', () => {
      expect(parseAllowedOrigins(undefined)).toEqual([]);
      expect(parseAllowedOrigins('')).toEqual([]);
      expect(parseAllowedOrigins([])).toEqual([]);
    });

    it('preserves and trims array input', () => {
      expect(parseAllowedOrigins([' http://localhost:3000 ', 'https://app.com'])).toEqual([
        'http://localhost:3000',
        'https://app.com',
      ]);
    });
  });

  describe('Allowed Origins', () => {
    it('sets CORS headers for an explicitly allowed origin on normal requests', async () => {
      const app = buildApp({
        cors: {
          enabled: true,
          origin: 'http://localhost:3000,http://localhost:5173,https://my-app.example.com',
          credentials: true,
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:5173',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('handles preflight OPTIONS requests for allowed origins', async () => {
      const app = buildApp({
        cors: {
          enabled: true,
          origin: 'https://my-app.example.com',
        },
      });

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'https://my-app.example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect([200, 204]).toContain(res.statusCode);
      expect(res.headers['access-control-allow-origin']).toBe('https://my-app.example.com');
      expect(res.headers['access-control-allow-methods']).toBeDefined();
      expect(res.headers['access-control-allow-headers']).toBeDefined();
    });
  });

  describe('Disallowed Origins', () => {
    it('does not return Access-Control-Allow-Origin for unauthorized origins on GET requests', async () => {
      const app = buildApp({
        cors: {
          enabled: true,
          origin: 'http://localhost:3000,https://app.example.com',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'https://malicious-site.evil.com',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not return Access-Control-Allow-Origin for unauthorized origins on preflight OPTIONS', async () => {
      const app = buildApp({
        cors: {
          enabled: true,
          origin: 'http://localhost:3000',
        },
      });

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/health',
        headers: {
          origin: 'https://unauthorized-origin.com',
          'access-control-request-method': 'POST',
        },
      });

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('Requests without an Origin Header (Native Mobile / Backend-to-Backend)', () => {
    it('allows requests without Origin header to execute successfully', async () => {
      const app = buildApp({
        cors: {
          enabled: true,
          origin: 'http://localhost:3000',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ status: 'ok' });
    });
  });

  describe('Disabled CORS (Native Mobile Only)', () => {
    it('does not emit CORS headers when CORS is explicitly disabled', async () => {
      const app = buildApp({
        cors: {
          enabled: false,
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: {
          origin: 'http://localhost:3000',
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
