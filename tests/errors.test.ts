import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

const app = buildApp();

// Register a test-only route throwing an unexpected error
app.get('/test-unexpected-error', async () => {
  throw new Error('Database connection failed with sensitive password=supersecret');
});

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('404 Not Found Handler', () => {
  it('GET unknown route returns standardized 404 response', async () => {
    const res = await request(app.server).get('/nonexistent-route-12345');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('message', 'Route not found');
    expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body).toHaveProperty('timestamp');
  });
});

describe('Global Error Handler', () => {
  it('handles unexpected errors with standardized 500 response without leaking details', async () => {
    const res = await request(app.server).get('/test-unexpected-error');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('message', 'Internal Server Error');
    expect(res.body).toHaveProperty('code', 'INTERNAL_SERVER_ERROR');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).not.toHaveProperty('stack');
    expect(JSON.stringify(res.body)).not.toContain('supersecret');
    expect(JSON.stringify(res.body)).not.toContain('Database connection failed');
  });
});
