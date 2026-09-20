import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

const app = buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('GET /health', () => {
  it('returns a successful health payload', async () => {
    const res = await request(app.server).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toHaveProperty('health', 'ok');
    expect(res.body).toHaveProperty('timestamp');
  });
});
