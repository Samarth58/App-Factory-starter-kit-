import fastifyHelmet, { type FastifyHelmetOptions } from '@fastify/helmet';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';

export type HelmetPluginOptions = FastifyHelmetOptions;

const helmetPlugin: FastifyPluginAsync<HelmetPluginOptions> = async (
  app: FastifyInstance,
  opts?: HelmetPluginOptions,
) => {
  await app.register(fastifyHelmet, {
    global: true,
    // Disable default CSP to prevent breaking Swagger UI (/docs) and API consumers
    contentSecurityPolicy: opts?.contentSecurityPolicy ?? false,
    crossOriginResourcePolicy: opts?.crossOriginResourcePolicy ?? { policy: 'cross-origin' },
    ...opts,
  });
};

export const registerHelmet = fp(helmetPlugin, {
  name: 'helmet',
});
