import type { FastifyInstance } from 'fastify';
import { pool } from '../db/connection.js';
import { fail, ok } from '../utils/response.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
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
