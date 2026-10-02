import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Rate Limiting Integration', () => {
  it('initializes rate limiter and allows requests within limits', async () => {
    const app = buildApp({ rateLimit: { max: 5, timeWindow: 60000 } });

    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBe('4');
  });

  it('blocks requests exceeding the configured rate limit with HTTP 429 and standard error envelope', async () => {
    const app = buildApp({ rateLimit: { max: 2, timeWindow: 60000 } });

    // First 2 requests succeed
    const res1 = await app.inject({ method: 'GET', url: '/health' });
    expect(res1.statusCode).toBe(200);

    const res2 = await app.inject({ method: 'GET', url: '/health' });
    expect(res2.statusCode).toBe(200);

    // 3rd request exceeds limit
    const res3 = await app.inject({ method: 'GET', url: '/health' });
    expect(res3.statusCode).toBe(429);

    const body = res3.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('Rate limit exceeded'),
        details: [],
      },
    });

    // Rate limit headers on 429 response
    expect(res3.headers['x-ratelimit-limit']).toBe('2');
    expect(res3.headers['x-ratelimit-remaining']).toBe('0');
    expect(res3.headers['retry-after']).toBeDefined();
    expect(res3.headers['x-request-id']).toBeDefined();
  });

  it('enforces route-specific rate limits on auth endpoints', async () => {
    const app = buildApp();

    // POST /register has route-specific limit of 10
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: 'invalid' },
    });

    // Even if validation fails (400), rate limit headers are applied
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });

  it('keeps normal authenticated routes functional and returns standard errors', async () => {
    const app = buildApp({ rateLimit: { max: 10, timeWindow: 60000 } });

    // Request unauthenticated protected endpoint
    const res = await app.inject({
      method: 'GET',
      url: '/examples',
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized',
        details: [],
      },
    });
    expect(res.headers['x-ratelimit-limit']).toBe('10');
  });
});
