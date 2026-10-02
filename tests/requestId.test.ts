import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp();

describe('Request ID Handling', () => {
  it('generates a UUID request ID when none is provided and returns it in headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const reqId = res.headers['x-request-id'] as string;
    expect(reqId).toBeDefined();
    expect(typeof reqId).toBe('string');
    expect(reqId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('echoes a valid supplied x-request-id', async () => {
    const customId = 'client-request-id_123.abc';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customId,
      },
    });

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('replaces an invalid x-request-id containing CRLF with a generated UUID', async () => {
    const maliciousId = 'req-id\r\nInjected-Header: malicious';
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': maliciousId,
      },
    });

    const reqId = res.headers['x-request-id'] as string;
    expect(reqId).not.toBe(maliciousId);
    expect(reqId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('replaces an over-long x-request-id (>64 characters) with a generated UUID', async () => {
    const overLongId = 'a'.repeat(65);
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': overLongId,
      },
    });

    const reqId = res.headers['x-request-id'] as string;
    expect(reqId).not.toBe(overLongId);
    expect(reqId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
