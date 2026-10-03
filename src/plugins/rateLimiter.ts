import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env } from '../config/env.js';

export interface RateLimiterOptions {
  max?: number;
  timeWindow?: number | string;
  allowList?: string[] | ((req: FastifyRequest, key: string) => boolean | Promise<boolean>);
  keyGenerator?: (req: FastifyRequest) => string;
}

const rateLimiterPlugin: FastifyPluginAsync<RateLimiterOptions> = async (
  app: FastifyInstance,
  opts?: RateLimiterOptions,
) => {
  await app.register(fastifyRateLimit, {
    global: true,
    max: opts?.max ?? env.RATE_LIMIT_MAX,
    timeWindow: opts?.timeWindow ?? env.RATE_LIMIT_WINDOW_MS,
    allowList: opts?.allowList,
    keyGenerator: opts?.keyGenerator,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
    errorResponseBuilder: (_request, context) => {
      const err = Object.assign(
        new Error(`Rate limit exceeded, retry in ${context.after}`),
        {
          statusCode: 429,
          code: 'RATE_LIMIT_EXCEEDED',
        },
      );
      return err;
    },
  });
};

export const registerRateLimiter = fp(rateLimiterPlugin, {
  name: 'rate-limiter',
});
