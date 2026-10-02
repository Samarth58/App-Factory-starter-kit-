import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp();

// Register a test-only route throwing an unexpected error
app.get('/test-unexpected-error', async () => {
  throw new Error(
    'Database connection failed with sensitive password=supersecret',
  );
});

describe('404 Not Found Handler', () => {
  it('GET unknown route returns standardized 404 RESOURCE_NOT_FOUND response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nonexistent-route-12345',
    });

    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'RESOURCE_NOT_FOUND',
        message: 'Route not found',
        details: [],
      },
    });
  });
});

describe('Global Error Handler', () => {
  it('handles unexpected errors with standardized 500 response without leaking details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test-unexpected-error',
    });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal Server Error',
        details: [],
      },
    });
    expect(body).not.toHaveProperty('stack');
    expect(JSON.stringify(body)).not.toContain('supersecret');
    expect(JSON.stringify(body)).not.toContain('Database connection failed');
  });
});
