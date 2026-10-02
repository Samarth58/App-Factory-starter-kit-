import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

async function swaggerPlugin(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'App Factory Backend Starter Kit',
        description:
          'Production-grade Node.js / Fastify backend substrate for the App Factory manufacturing pipeline, featuring JWT authentication, refresh rotation, RBAC, and canonical domain CRUD.',
        version: '1.0.0',
      },
      servers: [
        {
          url: '/',
          description: 'Current Environment API Server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Enter your JWT access token (Bearer <token>)',
          },
        },
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
  });
}

export const registerSwagger = fp(swaggerPlugin, {
  name: 'app-swagger',
});
