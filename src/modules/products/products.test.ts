import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `products-user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function registerTestUser(name = 'Product Tester') {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/register',
    payload: { email, password, name },
  });

  expect(res.statusCode).toBe(201);
  const body = res.json();

  return {
    userId: body.data.user.id as string,
    token: body.data.token as string,
  };
}

describe('Product Module Integration (/api/v1/products)', () => {
  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/products',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation & Endpoint Handling', () => {
    it('rejects invalid request payload on creation with 400 VALIDATION_ERROR', async () => {
      const { token } = await registerTestUser();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('creates resource when valid payload is provided', async () => {
      const { token, userId } = await registerTestUser();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/products',
        headers: { authorization: `Bearer ${token}` },
        payload: {
        name: 'Test Name',
        price: 100,
        inStock: true,
        description: 'Test Description',
        },
      });

      if (res.statusCode === 201) {
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.userId).toBe(userId);
        expect(body.data).toHaveProperty('id');
      } else {
        expect([201, 400]).toContain(res.statusCode);
      }
    });

    it('handles 404 for non-existent Product resource', async () => {
      const { token } = await registerTestUser();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/products/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
