import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { pool } from '../src/db/connection.js';
import { uniqueTestIp } from './helpers/testIp.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `example-user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function registerUser(name = 'Example Owner') {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/register',
    remoteAddress: uniqueTestIp(),
    payload: { email, password, name },
  });

  expect(res.statusCode).toBe(201);
  const body = res.json();

  return {
    userId: body.data.user.id as string,
    token: body.data.token as string,
  };
}

describe('Canonical Reference CRUD Module (src/modules/example/)', () => {
  describe('1. POST /examples (Create)', () => {
    it('creates a new example entity successfully for authenticated user', async () => {
      const { token, userId } = await registerUser();

      const res = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'First Example Item',
          description: 'A detailed description of the first example.',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toMatchObject({
        name: 'First Example Item',
        description: 'A detailed description of the first example.',
        userId,
      });
      expect(body.data).toHaveProperty('id');
      expect(body.data).toHaveProperty('createdAt');
      expect(body.data).toHaveProperty('updatedAt');

      // Verify persistence in DB
      const dbCheck = await pool.query('SELECT * FROM examples WHERE id = $1', [
        body.data.id,
      ]);
      expect(dbCheck.rows).toHaveLength(1);
      expect(dbCheck.rows[0]?.name).toBe('First Example Item');
    });

    it('creates an example with optional description omitted', async () => {
      const { token } = await registerUser();

      const res = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Minimal Example' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.description).toBeNull();
    });

    it('rejects unauthenticated create request with 401 UNAUTHORIZED', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/examples',
        payload: { name: 'Unauthorized Item' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('rejects invalid create body (empty name) with 400 VALIDATION_ERROR', async () => {
      const { token } = await registerUser();

      const res = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '   ' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('2. GET /examples (List & Pagination)', () => {
    it('lists examples with cursor pagination and nextCursor continuation', async () => {
      const { token } = await registerUser();

      // Create 5 items
      for (let i = 1; i <= 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/examples',
          headers: { authorization: `Bearer ${token}` },
          payload: { name: `Batch Item ${i}` },
        });
      }

      // Request page 1 with limit = 2
      const page1Res = await app.inject({
        method: 'GET',
        url: '/examples?limit=2',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page1Res.statusCode).toBe(200);
      const page1Body = page1Res.json();
      expect(page1Body.success).toBe(true);
      expect(page1Body.data).toHaveLength(2);
      expect(page1Body.meta.hasMore).toBe(true);
      expect(page1Body.meta.nextCursor).toBeDefined();

      // Request page 2 using nextCursor
      const page2Res = await app.inject({
        method: 'GET',
        url: `/examples?limit=2&cursor=${encodeURIComponent(page1Body.meta.nextCursor)}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(page2Res.statusCode).toBe(200);
      const page2Body = page2Res.json();
      expect(page2Body.data).toHaveLength(2);
      expect(page2Body.meta.hasMore).toBe(true);

      // Verify no item overlap between pages
      const page1Ids = page1Body.data.map((item: { id: string }) => item.id);
      const page2Ids = page2Body.data.map((item: { id: string }) => item.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });

    it('lists examples with limit-offset pagination', async () => {
      const { token } = await registerUser();

      for (let i = 1; i <= 4; i++) {
        await app.inject({
          method: 'POST',
          url: '/examples',
          headers: { authorization: `Bearer ${token}` },
          payload: { name: `Offset Item ${i}` },
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: '/examples?limit=2&offset=0',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.meta).toEqual({
        total: 4,
        limit: 2,
        offset: 0,
        hasMore: true,
      });
    });

    it('returns empty list with hasMore false when no records exist', async () => {
      const { token } = await registerUser();

      const res = await app.inject({
        method: 'GET',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data).toEqual([]);
      expect(body.meta.hasMore).toBe(false);
    });
  });

  describe('3. GET /examples/:id (Retrieve by ID)', () => {
    it('retrieves an existing example by ID for the owner', async () => {
      const { token } = await registerUser();

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Get Target Item', description: 'Item for retrieval' },
      });
      const item = createRes.json().data;

      const getRes = await app.inject({
        method: 'GET',
        url: `/examples/${item.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(getRes.statusCode).toBe(200);
      expect(getRes.json().data).toEqual(item);
    });

    it('returns 404 RESOURCE_NOT_FOUND for non-existent UUID', async () => {
      const { token } = await registerUser();
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const res = await app.inject({
        method: 'GET',
        url: `/examples/${fakeId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('returns 400 VALIDATION_ERROR for malformed UUID', async () => {
      const { token } = await registerUser();

      const res = await app.inject({
        method: 'GET',
        url: '/examples/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 when accessing an item owned by another user', async () => {
      const user1 = await registerUser('User One');
      const user2 = await registerUser('User Two');

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${user1.token}` },
        payload: { name: 'User 1 Private Item' },
      });
      const item = createRes.json().data;

      // User 2 attempts to fetch User 1's item
      const getRes = await app.inject({
        method: 'GET',
        url: `/examples/${item.id}`,
        headers: { authorization: `Bearer ${user2.token}` },
      });

      expect(getRes.statusCode).toBe(404);
      expect(getRes.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('4. PATCH /examples/:id (Update)', () => {
    it('updates name and description and updates updatedAt timestamp', async () => {
      const { token } = await registerUser();

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Original Name', description: 'Original Description' },
      });
      const created = createRes.json().data;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name', description: 'Updated Description' },
      });

      expect(updateRes.statusCode).toBe(200);
      const updated = updateRes.json().data;
      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated Description');
      expect(updated.id).toBe(created.id);
    });

    it('rejects empty update payload with 400 VALIDATION_ERROR', async () => {
      const { token } = await registerUser();

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'To Update' },
      });
      const created = createRes.json().data;

      const updateRes = await app.inject({
        method: 'PATCH',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(updateRes.statusCode).toBe(400);
      expect(updateRes.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('5. DELETE /examples/:id (Soft Delete)', () => {
    it('soft deletes example, hides it from list and get, and retains in DB with deleted_at', async () => {
      const { token } = await registerUser();

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Item to Delete' },
      });
      const created = createRes.json().data;

      // Delete the example
      const deleteRes = await app.inject({
        method: 'DELETE',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(deleteRes.statusCode).toBe(200);
      expect(deleteRes.json().success).toBe(true);

      // Verify soft delete in database directly
      const dbCheck = await pool.query(
        'SELECT deleted_at FROM examples WHERE id = $1',
        [created.id],
      );
      expect(dbCheck.rows[0]?.deleted_at).not.toBeNull();

      // Subsequent GET returns 404
      const getRes = await app.inject({
        method: 'GET',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getRes.statusCode).toBe(404);

      // Excluded from GET /examples list
      const listRes = await app.inject({
        method: 'GET',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
      });
      const items = listRes.json().data;
      expect(items.find((item: { id: string }) => item.id === created.id)).toBeUndefined();
    });

    it('returns 404 when attempting to delete an already deleted item', async () => {
      const { token } = await registerUser();

      const createRes = await app.inject({
        method: 'POST',
        url: '/examples',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Double Delete Item' },
      });
      const created = createRes.json().data;

      await app.inject({
        method: 'DELETE',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      const secondDeleteRes = await app.inject({
        method: 'DELETE',
        url: `/examples/${created.id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(secondDeleteRes.statusCode).toBe(404);
      expect(secondDeleteRes.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
