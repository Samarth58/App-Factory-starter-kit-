import fastifyCors from '@fastify/cors';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

export interface CorsPluginOptions {
  enabled?: boolean;
  origin?: string | string[] | boolean;
  credentials?: boolean;
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  methods?: string[];
}

export function parseAllowedOrigins(originConfig?: string | string[]): string[] {
  if (!originConfig) return [];
  if (Array.isArray(originConfig)) {
    return originConfig.map((o) => o.trim()).filter(Boolean);
  }
  return originConfig
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const corsPlugin: FastifyPluginAsync<CorsPluginOptions> = async (
  app: FastifyInstance,
  opts?: CorsPluginOptions,
) => {
  const isEnabled = opts?.enabled ?? env.CORS_ENABLED;
  if (!isEnabled) {
    return;
  }

  const rawOrigin = opts?.origin ?? env.CORS_ORIGIN;
  const allowedOrigins =
    typeof rawOrigin === 'string' || Array.isArray(rawOrigin)
      ? parseAllowedOrigins(rawOrigin)
      : rawOrigin;

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Allow requests with no Origin header (e.g., native mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }

      if (typeof allowedOrigins === 'boolean') {
        cb(null, allowedOrigins);
        return;
      }

      if (Array.isArray(allowedOrigins)) {
        if (allowedOrigins.length === 0) {
          cb(null, false);
          return;
        }

        const isAllowed = allowedOrigins.includes(origin);
        cb(null, isAllowed);
        return;
      }

      cb(null, false);
    },
    credentials: opts?.credentials ?? env.CORS_CREDENTIALS,
    methods: opts?.methods ?? ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: opts?.allowedHeaders ?? [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: opts?.exposedHeaders ?? [
      'x-request-id',
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
    ],
  });
};

export const registerCors = fp(corsPlugin, {
  name: 'cors',
});
