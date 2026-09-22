import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';
import { error as errorResponse } from './utils/response.js';

export function buildApp() {
  const app = Fastify();

  app.setErrorHandler((err: FastifyError, _request, reply) => {
    const statusCode =
      err.statusCode && err.statusCode >= 400 && err.statusCode < 500
        ? err.statusCode
        : 500;

    if (statusCode === 500) {
      return reply
        .status(500)
        .send(
          errorResponse('Internal Server Error', 'INTERNAL_SERVER_ERROR', 500),
        );
    }

    const code =
      statusCode === 401
        ? 'UNAUTHORIZED'
        : statusCode === 404
          ? 'NOT_FOUND'
          : statusCode === 400
            ? 'BAD_REQUEST'
            : (err.code || 'ERROR');

    return reply
      .status(statusCode)
      .send(errorResponse(err.message, code, statusCode));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply
      .status(404)
      .send(errorResponse('Route not found', 'NOT_FOUND', 404));
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(usersRoutes);

  return app;
}
