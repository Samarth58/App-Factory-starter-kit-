import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('POST /register', () => {
  it('registers a user without name', async () => {
    const email = uniqueEmail();
    const res = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('id');
    expect(res.body.data.user).toHaveProperty('email', email);
    expect(res.body.data.user).toHaveProperty('name', null);
    expect(res.body.data.user).toHaveProperty('created_at');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('deletedAt');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('deleted_at');
  });

  it('rejects a duplicate active email', async () => {
    const email = uniqueEmail();

    const first = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(first.status).toBe(201);

    const second = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(second.status).toBe(409);
    expect(second.body).toHaveProperty('status', 'error');
    expect(second.body).toHaveProperty('code', 'EMAIL_EXISTS');
  });

  it('rejects an invalid email', async () => {
    const res = await request(app.server)
      .post('/register')
      .send({ email: 'not-an-email', password });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('rejects a short password', async () => {
    const res = await request(app.server)
      .post('/register')
      .send({ email: uniqueEmail(), password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });
});

describe('POST /login', () => {
  it('logs in an active user', async () => {
    const email = uniqueEmail();
    const register = await request(app.server)
      .post('/register')
      .send({ email, password, name: 'Login User' });

    expect(register.status).toBe(201);

    const res = await request(app.server)
      .post('/login')
      .send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body.data).toHaveProperty('user');
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user).toHaveProperty('id');
    expect(res.body.data.user).toHaveProperty('email', email);
    expect(res.body.data.user).toHaveProperty('name', 'Login User');
    expect(res.body.data.user).toHaveProperty('created_at');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('deletedAt');
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.user).not.toHaveProperty('deleted_at');
  });

  it('rejects a wrong password', async () => {
    const email = uniqueEmail();
    const register = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(register.status).toBe(201);

    const res = await request(app.server)
      .post('/login')
      .send({ email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('rejects a nonexistent email', async () => {
    const res = await request(app.server)
      .post('/login')
      .send({ email: uniqueEmail(), password });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('rejects login for a soft-deleted account', async () => {
    const email = uniqueEmail();
    const register = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(register.status).toBe(201);

    const userId = register.body.data.user.id as string;
    const token = register.body.data.token as string;

    const deleted = await request(app.server)
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);

    const res = await request(app.server)
      .post('/login')
      .send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });
});
