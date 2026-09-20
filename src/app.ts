import Fastify from 'fastify';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';

export function buildApp() {
  const app = Fastify();

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(usersRoutes);

  return app;
}
