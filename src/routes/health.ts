import type { FastifyInstance } from 'fastify';
import { pool } from '../db/connection.js';
import { fail, ok } from '../utils/response.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    try {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Database query timed out')), 2000),
        ),
      ]);

      return reply.status(200).send(ok({ status: 'ok' }));
    } catch {
      return reply
        .status(503)
        .send(fail('SERVICE_UNAVAILABLE', 'Service Unavailable', []));
    }
  });
}
