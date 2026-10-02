import Fastify from 'fastify';
import type { FastifyError, FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';
import { fail } from './utils/response.js';

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: process.env.LOG_LEVEL || 'info',
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.body.password',
              'req.body.token',
              'req.body.refreshToken',
              '*.password',
              '*.token',
            ],
          },
    requestIdHeader: false,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      const rawId = Array.isArray(header) ? header[0] : header;
      if (typeof rawId === 'string' && /^[A-Za-z0-9._-]{1,64}$/.test(rawId)) {
        return rawId;
      }
      return crypto.randomUUID();
    },
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setErrorHandler((err: FastifyError | Error, _request, reply) => {
    if (err instanceof ZodError) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Validation failed', err.issues));
    }

    const fastifyErr = err as FastifyError;
    const statusCode =
      fastifyErr.statusCode &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode <= 599
        ? fastifyErr.statusCode
        : 500;

    if (statusCode === 500) {
      return reply
        .status(500)
        .send(fail('INTERNAL_SERVER_ERROR', 'Internal Server Error', []));
    }

    let code: string = 'VALIDATION_ERROR';
    if (statusCode === 400) {
      code = 'VALIDATION_ERROR';
    } else if (statusCode === 401) {
      code = 'UNAUTHORIZED';
    } else if (statusCode === 403) {
      code = 'FORBIDDEN';
    } else if (statusCode === 404) {
      code = 'RESOURCE_NOT_FOUND';
    } else if (statusCode === 409) {
      code = 'CONFLICT';
    } else if (statusCode === 429) {
      code = 'RATE_LIMIT_EXCEEDED';
    } else if (statusCode === 503) {
      code = 'SERVICE_UNAVAILABLE';
    } else if (fastifyErr.code && fastifyErr.code in ERROR_CODES) {
      code = fastifyErr.code;
    }

    const details =
      (fastifyErr as unknown as { details?: unknown[] }).details ||
      (fastifyErr.validation ? [fastifyErr.validation] : []);

    return reply
      .status(statusCode)
      .send(
        fail(
          code,
          fastifyErr.message || 'An error occurred',
          Array.isArray(details) ? details : [details],
        ),
      );
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply
      .status(404)
      .send(fail('RESOURCE_NOT_FOUND', 'Route not found', []));
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(usersRoutes);

  return app;
}
