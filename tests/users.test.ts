import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { uniqueTestIp } from './helpers/testIp.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function registerUser(name?: string) {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/register',
    remoteAddress: uniqueTestIp(),
    payload: { email, password, ...(name !== undefined ? { name } : {}) },
  });

  expect(res.statusCode).toBe(201);
  const body = res.json();

  return {
    email,
    user: body.data.user as {
      id: string;
      email: string;
      name: string | null;
      created_at: string;
    },
    token: body.data.token as string,
  };
}

describe('GET /users/:id', () => {
  it('returns an existing active user', async () => {
    const { user, token, email } = await registerUser('Existing User');

    const res = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('id', user.id);
    expect(body.data).toHaveProperty('email', email);
    expect(body.data).toHaveProperty('name', 'Existing User');
    expect(body.data).toHaveProperty('created_at');
    expect(body.data).not.toHaveProperty('passwordHash');
    expect(body.data).not.toHaveProperty('deletedAt');
    expect(body.data).not.toHaveProperty('password_hash');
    expect(body.data).not.toHaveProperty('deleted_at');
  });

  it('rejects a request without Authorization', async () => {
    const { user } = await registerUser();

    const res = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects an invalid JWT', async () => {
    const { user } = await registerUser();

    const res = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns UNAUTHORIZED for a nonexistent user token', async () => {
    const { token } = await registerUser();
    const missingId = '00000000-0000-4000-8000-000000000000';

    const res = await app.inject({
      method: 'GET',
      url: `/users/${missingId}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED when accessing another user\'s ID', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await app.inject({
      method: 'GET',
      url: `/users/${userB.user.id}`,
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Unauthorized');
    expect(body).not.toHaveProperty('data');
    expect(JSON.stringify(body)).not.toContain(userB.email);
  });

  it('Soft-deleted user cannot access protected endpoints with valid token', async () => {
    const { user, email } = await registerUser('User A');

    const loginRes = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    expect(loginRes.statusCode).toBe(200);
    const token = loginRes.json().data.token as string;

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(deleteRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(getRes.statusCode).toBe(401);
    const body = getRes.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Unauthorized');
    expect(body).not.toHaveProperty('data');
    expect(JSON.stringify(body)).not.toContain(email);
  });
});

describe('PUT /users/:id', () => {
  it('updates name only', async () => {
    const { user, token, email } = await registerUser('Original Name');

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'Updated Name' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toHaveProperty('name', 'Updated Name');
    expect(body.data.user).toHaveProperty('email', email);
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(body.data.user).not.toHaveProperty('deletedAt');
  });

  it('updates email only', async () => {
    const { user, token } = await registerUser('Keep Name');
    const newEmail = uniqueEmail();

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { email: newEmail },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toHaveProperty('email', newEmail);
    expect(body.data.user).toHaveProperty('name', 'Keep Name');
    expect(body.data.user).not.toHaveProperty('passwordHash');
    expect(body.data.user).not.toHaveProperty('deletedAt');
  });

  it('updates name and email together', async () => {
    const { user, token } = await registerUser('Both Original');
    const newEmail = uniqueEmail();

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'Updated Name', email: newEmail },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toHaveProperty('name', 'Updated Name');
    expect(body.data.user).toHaveProperty('email', newEmail);
  });

  it('rejects an empty body with VALIDATION_ERROR', async () => {
    const { user, token } = await registerUser();

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an unknown field with VALIDATION_ERROR', async () => {
    const { user, token } = await registerUser();

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { unknown: 'value' },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a duplicate active email with CONFLICT', async () => {
    const first = await registerUser();
    const second = await registerUser();

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${first.user.id}`,
      headers: {
        authorization: `Bearer ${first.token}`,
      },
      payload: { email: second.email },
    });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('returns 401 UNAUTHORIZED when updating another user', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${userB.user.id}`,
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
      payload: { name: 'Hacked Name' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Unauthorized');

    const unchanged = await app.inject({
      method: 'GET',
      url: `/users/${userB.user.id}`,
      headers: {
        authorization: `Bearer ${userB.token}`,
      },
    });

    expect(unchanged.statusCode).toBe(200);
    const unchangedBody = unchanged.json();
    expect(unchangedBody.data).toHaveProperty('name', 'User B');
    expect(unchangedBody.data).toHaveProperty('email', userB.email);
  });

  it('does not update a soft-deleted user', async () => {
    const { user, token } = await registerUser();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(deleted.statusCode).toBe(200);

    const res = await app.inject({
      method: 'PUT',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
      payload: { name: 'After Delete' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('DELETE /users/:id', () => {
  it('soft-deletes a user', async () => {
    const { user, token } = await registerUser();

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ success: true });

    const getRes = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(getRes.statusCode).toBe(401);
    const getBody = getRes.json();
    expect(getBody.success).toBe(false);
    expect(getBody.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects deleting an already deleted user with UNAUTHORIZED', async () => {
    const { user, token } = await registerUser();

    const first = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(second.statusCode).toBe(401);
    const body = second.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 UNAUTHORIZED when deleting another user', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${userB.user.id}`,
      headers: {
        authorization: `Bearer ${userA.token}`,
      },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Unauthorized');

    const stillExists = await app.inject({
      method: 'GET',
      url: `/users/${userB.user.id}`,
      headers: {
        authorization: `Bearer ${userB.token}`,
      },
    });

    expect(stillExists.statusCode).toBe(200);
    const stillBody = stillExists.json();
    expect(stillBody.data).toHaveProperty('id', userB.user.id);
  });

  it('rejects delete without Authorization', async () => {
    const { user } = await registerUser();

    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('prevents login after soft delete', async () => {
    const { user, token, email } = await registerUser();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
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

  it('allows reusing a soft-deleted email', async () => {
    const { user, token, email } = await registerUser();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(deleted.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST',
      url: '/register',
      remoteAddress: uniqueTestIp(),
      payload: { email, password },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.user).toHaveProperty('id');
    expect(body.data.user.id).not.toBe(user.id);
    expect(body.data.user).toHaveProperty('email', email);
  });
});
