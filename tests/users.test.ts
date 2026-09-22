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

async function registerUser(name?: string) {
  const email = uniqueEmail();
  const res = await request(app.server)
    .post('/register')
    .send({ email, password, ...(name !== undefined ? { name } : {}) });

  expect(res.status).toBe(201);

  return {
    email,
    user: res.body.data.user as {
      id: string;
      email: string;
      name: string | null;
      created_at: string;
    },
    token: res.body.data.token as string,
  };
}

describe('GET /users/:id', () => {
  it('returns an existing active user', async () => {
    const { user, token, email } = await registerUser('Existing User');

    const res = await request(app.server)
      .get(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body.data).toHaveProperty('id', user.id);
    expect(res.body.data).toHaveProperty('email', email);
    expect(res.body.data).toHaveProperty('name', 'Existing User');
    expect(res.body.data).toHaveProperty('created_at');
    expect(res.body.data).not.toHaveProperty('passwordHash');
    expect(res.body.data).not.toHaveProperty('deletedAt');
    expect(res.body.data).not.toHaveProperty('password_hash');
    expect(res.body.data).not.toHaveProperty('deleted_at');
  });

  it('rejects a request without Authorization', async () => {
    const { user } = await registerUser();

    const res = await request(app.server).get(`/users/${user.id}`);

    expect(res.status).toBe(401);
  });

  it('rejects an invalid JWT', async () => {
    const { user } = await registerUser();

    const res = await request(app.server)
      .get(`/users/${user.id}`)
      .set('Authorization', 'Bearer invalid-token');

    expect(res.status).toBe(401);
  });

  it('returns USER_NOT_FOUND for a nonexistent user', async () => {
    const { token } = await registerUser();
    const missingId = '00000000-0000-4000-8000-000000000000';

    const res = await request(app.server)
      .get(`/users/${missingId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
  });

  it('returns 401 when accessing another user\'s ID', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await request(app.server)
      .get(`/users/${userB.user.id}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('message', 'Unauthorized');
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');
    expect(res.body).not.toHaveProperty('data');
    expect(JSON.stringify(res.body)).not.toContain(userB.email);
  });

  it('returns USER_NOT_FOUND for a soft-deleted user', async () => {
    const { user, token } = await registerUser();

    const deleted = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);

    const res = await request(app.server)
      .get(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'USER_NOT_FOUND');
  });
});

describe('PUT /users/:id', () => {
  it('updates name only', async () => {
    const { user, token, email } = await registerUser('Original Name');

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');
    expect(res.body.data.user).toHaveProperty('name', 'Updated Name');
    expect(res.body.data.user).toHaveProperty('email', email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('deletedAt');
  });

  it('updates email only', async () => {
    const { user, token } = await registerUser('Keep Name');
    const newEmail = uniqueEmail();

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: newEmail });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toHaveProperty('email', newEmail);
    expect(res.body.data.user).toHaveProperty('name', 'Keep Name');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(res.body.data.user).not.toHaveProperty('deletedAt');
  });

  it('updates name and email together', async () => {
    const { user, token } = await registerUser('Both Original');
    const newEmail = uniqueEmail();

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', email: newEmail });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toHaveProperty('name', 'Updated Name');
    expect(res.body.data.user).toHaveProperty('email', newEmail);
  });

  it('rejects an empty body', async () => {
    const { user, token } = await registerUser();

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('rejects an unknown field', async () => {
    const { user, token } = await registerUser();

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ unknown: 'value' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code', 'VALIDATION_ERROR');
  });

  it('rejects a duplicate active email', async () => {
    const first = await registerUser();
    const second = await registerUser();

    const res = await request(app.server)
      .put(`/users/${first.user.id}`)
      .set('Authorization', `Bearer ${first.token}`)
      .send({ email: second.email });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('code', 'EMAIL_EXISTS');
  });

  it('returns 401 when updating another user', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await request(app.server)
      .put(`/users/${userB.user.id}`)
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: 'Hacked Name' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('message', 'Unauthorized');
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');

    const unchanged = await request(app.server)
      .get(`/users/${userB.user.id}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(unchanged.status).toBe(200);
    expect(unchanged.body.data).toHaveProperty('name', 'User B');
    expect(unchanged.body.data).toHaveProperty('email', userB.email);
  });

  it('does not update a soft-deleted user', async () => {
    const { user, token } = await registerUser();

    const deleted = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);

    const res = await request(app.server)
      .put(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'After Delete' });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('code', 'USER_NOT_FOUND');
  });
});

describe('DELETE /users/:id', () => {
  it('soft-deletes a user', async () => {
    const { user, token } = await registerUser();

    const res = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'success');

    const getRes = await request(app.server)
      .get(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(getRes.status).toBe(404);
    expect(getRes.body).toHaveProperty('code', 'USER_NOT_FOUND');
  });

  it('rejects deleting an already deleted user', async () => {
    const { user, token } = await registerUser();

    const first = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(first.status).toBe(200);

    const second = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(404);
    expect(second.body).toHaveProperty('code', 'USER_NOT_FOUND');
  });

  it('returns 401 when deleting another user', async () => {
    const userA = await registerUser('User A');
    const userB = await registerUser('User B');

    const res = await request(app.server)
      .delete(`/users/${userB.user.id}`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('status', 'error');
    expect(res.body).toHaveProperty('message', 'Unauthorized');
    expect(res.body).toHaveProperty('code', 'UNAUTHORIZED');

    const stillExists = await request(app.server)
      .get(`/users/${userB.user.id}`)
      .set('Authorization', `Bearer ${userB.token}`);

    expect(stillExists.status).toBe(200);
    expect(stillExists.body.data).toHaveProperty('id', userB.user.id);
  });

  it('rejects delete without Authorization', async () => {
    const { user } = await registerUser();

    const res = await request(app.server).delete(`/users/${user.id}`);

    expect(res.status).toBe(401);
  });

  it('prevents login after soft delete', async () => {
    const { user, token, email } = await registerUser();

    const deleted = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);

    const res = await request(app.server)
      .post('/login')
      .send({ email, password });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('code', 'INVALID_CREDENTIALS');
  });

  it('allows reusing a soft-deleted email', async () => {
    const { user, token, email } = await registerUser();

    const deleted = await request(app.server)
      .delete(`/users/${user.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(deleted.status).toBe(200);

    const res = await request(app.server)
      .post('/register')
      .send({ email, password });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toHaveProperty('id');
    expect(res.body.data.user.id).not.toBe(user.id);
    expect(res.body.data.user).toHaveProperty('email', email);
  });
});
