import type { FastifyInstance } from 'fastify';
import { pool } from '../db/connection.js';
import { fail, ok } from '../utils/response.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  // Liveness probe - verifies application process is running (does not depend on DB)
  app.get(
    '/health/live',
    {
      schema: {
        tags: ['Health'],
        summary: 'Liveness health check',
        description:
          'Verifies backend process is running and responsive (Kubernetes liveness probe). Does not depend on external services.',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      return reply.status(200).send(ok({ status: 'ok' }));
    },
  );

  // Readiness probe - verifies database connectivity and ability to serve traffic
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['Health'],
        summary: 'Readiness health check',
        description:
          'Verifies backend readiness to serve traffic by checking PostgreSQL connectivity with a safe timeout.',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'SERVICE_UNAVAILABLE' },
                  message: { type: 'string', example: 'Service Unavailable' },
                  details: { type: 'array', items: {} },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await Promise.race([
          pool.query('SELECT 1'),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Database query timed out')),
              2000,
            ),
          ),
        ]);

        return reply.status(200).send(ok({ status: 'ok' }));
      } catch {
        return reply
          .status(503)
          .send(fail('SERVICE_UNAVAILABLE', 'Service Unavailable', []));
      }
    },
  );

  // Legacy / backward-compatible health check endpoint
  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Service health check',
        description:
          'Verifies backend process health and active PostgreSQL database connectivity',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                },
              },
            },
          },
          503: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string', example: 'SERVICE_UNAVAILABLE' },
                  message: { type: 'string', example: 'Service Unavailable' },
                  details: { type: 'array', items: {} },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      try {
        await Promise.race([
          pool.query('SELECT 1'),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Database query timed out')),
              2000,
            ),
          ),
        ]);

        return reply.status(200).send(ok({ status: 'ok' }));
      } catch {
        return reply
          .status(503)
          .send(fail('SERVICE_UNAVAILABLE', 'Service Unavailable', []));
      }
    },
  );
}
