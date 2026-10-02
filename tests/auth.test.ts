import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

describe('POST /register', () => {
  it('registers a user without name', async () => {
    const email = uniqueEmail();
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('user');
    expect(body.data).toHaveProperty('token');
    expect(body.data.user).toHaveProperty('id');
    expect(body.data.user).toHaveProperty('email', email);
    expect(body.data.user).toHaveProperty('name', null);
    expect(body.data.user).toHaveProperty('created_at');
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(body.data.user).not.toHaveProperty('deletedAt');
    expect(body.data.user).not.toHaveProperty('password_hash');
    expect(body.data.user).not.toHaveProperty('deleted_at');
  });

  it('rejects a duplicate active email with CONFLICT', async () => {
    const email = uniqueEmail();

    const first = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password },
    });

    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password },
    });

    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Email already registered');
    expect(body.error.details).toEqual([]);
  });

  it('rejects an invalid email with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: 'not-an-email', password },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toBeInstanceOf(Array);
    expect(body.error.details.length).toBeGreaterThan(0);
  });

  it('rejects a short password with VALIDATION_ERROR', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: uniqueEmail(), password: 'short' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /login', () => {
  it('logs in an active user', async () => {
    const email = uniqueEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password, name: 'Login User' },
    });

    expect(register.statusCode).toBe(201);

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('user');
    expect(body.data).toHaveProperty('token');
    expect(body.data.user).toHaveProperty('id');
    expect(body.data.user).toHaveProperty('email', email);
    expect(body.data.user).toHaveProperty('name', 'Login User');
    expect(body.data.user).toHaveProperty('created_at');
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(body.data.user).not.toHaveProperty('deletedAt');
    expect(body.data.user).not.toHaveProperty('password_hash');
    expect(body.data.user).not.toHaveProperty('deleted_at');
  });

  it('rejects a wrong password with UNAUTHORIZED', async () => {
    const email = uniqueEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password },
    });

    expect(register.statusCode).toBe(201);

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password: 'wrong-password' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a nonexistent email with UNAUTHORIZED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: uniqueEmail(), password },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects login for a soft-deleted account with UNAUTHORIZED', async () => {
    const email = uniqueEmail();
    const register = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email, password },
    });

    expect(register.statusCode).toBe(201);
    const regBody = register.json();
    const userId = regBody.data.user.id as string;
    const token = regBody.data.token as string;

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/users/${userId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(deleted.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
