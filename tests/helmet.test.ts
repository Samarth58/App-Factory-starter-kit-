import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('Helmet Security Headers Plugin', () => {
  it('applies standard security headers to HTTP responses', async () => {
    const app = buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(res.statusCode).toBe(200);
    // Standard helmet security headers
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-download-options']).toBe('noopen');
    expect(res.headers['origin-agent-cluster']).toBe('?1');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('allows customizing helmet options via buildApp', async () => {
    const app = buildApp({
      helmet: {
        frameguard: {
          action: 'deny',
        },
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/health/live',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});
