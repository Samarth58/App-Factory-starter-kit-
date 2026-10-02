import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `admin-test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function registerUser(name?: string) {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/register',
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
      role: 'user' | 'admin';
      created_at: string;
    },
    token: body.data.token as string,
    refreshToken: body.data.refreshToken as string,
  };
}

async function createAdminUser(name = 'Admin User') {
  const registered = await registerUser(name);
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [
    registered.user.id,
  ]);
  registered.user.role = 'admin';
  return registered;
}

describe('RBAC and Admin Routes', () => {
  describe('1. Unauthenticated requests return 401 UNAUTHORIZED', () => {
    it('rejects GET /admin/users without token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects GET /admin/users/:id without token', async () => {
      const { user } = await registerUser();
      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${user.id}`,
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects DELETE /admin/users/:id without token', async () => {
      const { user } = await registerUser();
      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${user.id}`,
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('2. Normal authenticated user (role = "user") returns 403 FORBIDDEN', () => {
    it('rejects normal user accessing GET /admin/users with 403', async () => {
      const { token } = await registerUser('Regular User');

      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('rejects normal user accessing GET /admin/users/:id with 403', async () => {
      const normalUser = await registerUser('Regular User');
      const targetUser = await registerUser('Target User');

      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${targetUser.user.id}`,
        headers: { authorization: `Bearer ${normalUser.token}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('rejects normal user accessing DELETE /admin/users/:id with 403', async () => {
      const normalUser = await registerUser('Regular User');
      const targetUser = await registerUser('Target User');

      const res = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${targetUser.user.id}`,
        headers: { authorization: `Bearer ${normalUser.token}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('3. Admin user returns 200 on GET /admin/users', () => {
    it('returns active user list for admin', async () => {
      const admin = await createAdminUser();
      const user1 = await registerUser('User One');
      const user2 = await registerUser('User Two');

      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);

      const returnedIds = body.data.map((u: { id: string }) => u.id);
      expect(returnedIds).toContain(admin.user.id);
      expect(returnedIds).toContain(user1.user.id);
      expect(returnedIds).toContain(user2.user.id);
    });
  });

  describe('4. Admin can retrieve a user via GET /admin/users/:id', () => {
    it('returns target user details to admin', async () => {
      const admin = await createAdminUser();
      const target = await registerUser('Target User');

      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(target.user.id);
      expect(body.data.email).toBe(target.email);
      expect(body.data.name).toBe('Target User');
      expect(body.data.role).toBe('user');
      expect(body.data).toHaveProperty('created_at');
    });

    it('returns 404 RESOURCE_NOT_FOUND when user does not exist', async () => {
      const admin = await createAdminUser();
      const nonExistentId = '00000000-0000-0000-0000-000000000000';

      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${nonExistentId}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR when user ID is invalid UUID', async () => {
      const admin = await createAdminUser();

      const res = await app.inject({
        method: 'GET',
        url: '/admin/users/invalid-uuid',
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('5. Normal user cannot retrieve a user via GET /admin/users/:id', () => {
    it('returns 403 FORBIDDEN even when requesting own ID through admin route', async () => {
      const normalUser = await registerUser('Self Normal User');

      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${normalUser.user.id}`,
        headers: { authorization: `Bearer ${normalUser.token}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('6 & 7. Admin can delete a user (soft-delete)', () => {
    it('soft-deletes target user and subsequent retrieval returns 404', async () => {
      const admin = await createAdminUser();
      const target = await registerUser('To Be Deleted');

      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().success).toBe(true);

      // Verify soft delete in database directly
      const dbCheck = await pool.query(
        'SELECT deleted_at FROM users WHERE id = $1',
        [target.user.id],
      );
      expect(dbCheck.rows[0]?.deleted_at).not.toBeNull();

      // Subsequent admin GET returns 404
      const getRes = await app.inject({
        method: 'GET',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      expect(getRes.statusCode).toBe(404);
      expect(getRes.json().error.code).toBe('RESOURCE_NOT_FOUND');

      // Subsequent admin DELETE returns 404
      const deleteAgainRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      expect(deleteAgainRes.statusCode).toBe(404);
      expect(deleteAgainRes.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR when deleting with invalid UUID', async () => {
      const admin = await createAdminUser();

      const res = await app.inject({
        method: 'DELETE',
        url: '/admin/users/not-a-valid-uuid',
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe("8. Deleted user's sessions are revoked", () => {
    it('revokes all sessions when admin deletes user and blocks refresh', async () => {
      const admin = await createAdminUser();
      const target = await registerUser('Session Target');

      // Target has active refresh token and session row
      const sessionBefore = await pool.query(
        'SELECT revoked_at FROM user_sessions WHERE user_id = $1',
        [target.user.id],
      );
      expect(sessionBefore.rows.length).toBeGreaterThan(0);
      expect(sessionBefore.rows.every((r) => r.revoked_at === null)).toBe(true);

      // Admin deletes user
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });
      expect(deleteRes.statusCode).toBe(200);

      // Sessions in DB are revoked
      const sessionAfter = await pool.query(
        'SELECT revoked_at FROM user_sessions WHERE user_id = $1',
        [target.user.id],
      );
      expect(sessionAfter.rows.every((r) => r.revoked_at !== null)).toBe(true);

      // Attempting to refresh with target user's token fails with 401
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken: target.refreshToken },
      });
      expect(refreshRes.statusCode).toBe(401);
      expect(refreshRes.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('9. Deleted user cannot access admin routes', () => {
    it('returns 401 UNAUTHORIZED when a soft-deleted admin tries to access admin routes', async () => {
      const admin = await createAdminUser('Deleted Admin');

      // Soft-delete the admin user directly in DB
      await pool.query('UPDATE users SET deleted_at = now() WHERE id = $1', [
        admin.user.id,
      ]);

      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('10 & 11. Secrets (password hash, jti_hash, tokens) are never returned', () => {
    it('never exposes password_hash or session hashes on GET /admin/users', async () => {
      const admin = await createAdminUser();
      await registerUser('Secret Test User');

      const res = await app.inject({
        method: 'GET',
        url: '/admin/users',
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(200);
      const usersList = res.json().data as Array<Record<string, unknown>>;
      expect(usersList.length).toBeGreaterThan(0);

      for (const u of usersList) {
        expect(u).not.toHaveProperty('passwordHash');
        expect(u).not.toHaveProperty('password_hash');
        expect(u).not.toHaveProperty('jtiHash');
        expect(u).not.toHaveProperty('jti_hash');
        expect(u).not.toHaveProperty('refreshToken');
        expect(u).not.toHaveProperty('refresh_token');
        expect(u).not.toHaveProperty('sessionId');
      }
    });

    it('never exposes password_hash or session hashes on GET /admin/users/:id', async () => {
      const admin = await createAdminUser();
      const target = await registerUser('Secret Target User');

      const res = await app.inject({
        method: 'GET',
        url: `/admin/users/${target.user.id}`,
        headers: { authorization: `Bearer ${admin.token}` },
      });

      expect(res.statusCode).toBe(200);
      const u = res.json().data as Record<string, unknown>;
      expect(u).not.toHaveProperty('passwordHash');
      expect(u).not.toHaveProperty('password_hash');
      expect(u).not.toHaveProperty('jtiHash');
      expect(u).not.toHaveProperty('jti_hash');
      expect(u).not.toHaveProperty('refreshToken');
      expect(u).not.toHaveProperty('refresh_token');
      expect(u).not.toHaveProperty('sessionId');
    });
  });
});
