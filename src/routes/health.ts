import { FastifyInstance } from 'fastify';
import { success } from '../utils/response.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send(success({ health: 'ok' }, 200));
  });
}
