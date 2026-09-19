import 'dotenv/config';
import Fastify from 'fastify';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { usersRoutes } from './routes/users.js';

const app = Fastify();

await app.register(healthRoutes);
await app.register(authRoutes);
await app.register(usersRoutes);

const port = Number(process.env.PORT) || 3000;

await app.listen({ port, host: '0.0.0.0' });
