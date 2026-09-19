import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

function toUserResponse(user: { id: string; email: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    created_at: user.createdAt.toISOString(),
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash })
      .returning({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
      });

    const token = signToken(user.id);

    return reply.status(201).send({
      user: toUserResponse(user),
      token,
    });
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid request body' });
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    if (!isValid) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);

    return reply.status(200).send({
      user: toUserResponse(user),
      token,
    });
  });
}
