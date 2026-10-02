import '@fastify/swagger';
import type { OpenAPIV3 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('OpenAPI / Swagger Documentation', () => {
  it('initializes Swagger and generates a valid OpenAPI 3.x document', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    expect(openapi).toBeDefined();
    expect(openapi.openapi).toMatch(/^3\./);
    expect(openapi.info.title).toBe('App Factory Backend Starter Kit');
    expect(openapi.info.version).toBe('1.0.0');
    expect(openapi.info.description).toContain('App Factory');
  });

  it('exposes Swagger UI at /docs', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/docs/',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('exposes OpenAPI JSON specification via Swagger endpoint', async () => {
    const app = buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/docs/json',
    });

    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.paths).toBeDefined();
  });

  it('configures the Bearer JWT security scheme', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    expect(openapi.components?.securitySchemes).toBeDefined();
    expect(openapi.components?.securitySchemes?.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Enter your JWT access token (Bearer <token>)',
    });
  });

  it('documents health endpoint', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    expect(openapi.paths?.['/health']).toBeDefined();
    expect(openapi.paths?.['/health']?.get).toBeDefined();
    expect(openapi.paths?.['/health']?.get?.tags).toContain('Health');
  });

  it('documents authentication endpoints', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    const paths = openapi.paths || {};

    expect(paths['/register']?.post).toBeDefined();
    expect(paths['/register']?.post?.tags).toContain('Auth');

    expect(paths['/login']?.post).toBeDefined();
    expect(paths['/login']?.post?.tags).toContain('Auth');

    expect(paths['/refresh']?.post).toBeDefined();
    expect(paths['/refresh']?.post?.tags).toContain('Auth');

    expect(paths['/logout']?.post).toBeDefined();
    expect(paths['/logout']?.post?.tags).toContain('Auth');
  });

  it('documents user and admin endpoints with bearer security', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    const paths = openapi.paths || {};

    // User endpoints
    expect(paths['/users/{id}']?.get).toBeDefined();
    expect(paths['/users/{id}']?.put).toBeDefined();
    expect(paths['/users/{id}']?.delete).toBeDefined();

    // Admin endpoints
    expect(paths['/admin/users']?.get).toBeDefined();
    expect(paths['/admin/users/{id}']?.get).toBeDefined();
    expect(paths['/admin/users/{id}/role']?.patch).toBeDefined();
    expect(paths['/admin/users/{id}/revoke-sessions']?.post).toBeDefined();
    expect(paths['/admin/users/{id}']?.delete).toBeDefined();

    // Verify bearer auth on protected routes
    expect(paths['/admin/users']?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(paths['/admin/users/{id}/role']?.patch?.security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it('documents example CRUD module endpoints with pagination and security', async () => {
    const app = buildApp();
    await app.ready();

    const openapi = app.swagger() as OpenAPIV3.Document;
    const paths = openapi.paths || {};

    expect(paths['/examples']?.post).toBeDefined();
    expect(paths['/examples']?.get).toBeDefined();
    expect(paths['/examples/{id}']?.get).toBeDefined();
    expect(paths['/examples/{id}']?.patch).toBeDefined();
    expect(paths['/examples/{id}']?.delete).toBeDefined();

    expect(paths['/examples']?.get?.tags).toContain('Examples');
    expect(paths['/examples']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('preserves normal route execution and behavior', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { status: 'ok' },
    });
  });
});
