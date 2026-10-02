import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

describe('GET /health', () => {
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
