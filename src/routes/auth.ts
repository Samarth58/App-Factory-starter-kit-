import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { fail, ok } from '../utils/response.js';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string(),
  password: z.string(),
});

function toUserResponse(user: {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    created_at: user.createdAt.toISOString(),
  };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
    }

    const { email, password, name } = parsed.data;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (existing.length > 0) {
      return reply
        .status(409)
        .send(fail('CONFLICT', 'Email already registered', []));
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({ email, passwordHash, name: name ?? null })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      });

    const token = signToken(user.id);

    return reply.status(201).send(
      ok({
        user: toUserResponse(user),
        token,
      }),
    );
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
    }

    const { email, password } = parsed.data;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return reply
        .status(401)
        .send(fail('UNAUTHORIZED', 'Invalid email or password', []));
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    if (!isValid) {
      return reply
        .status(401)
        .send(fail('UNAUTHORIZED', 'Invalid email or password', []));
    }

    const token = signToken(user.id);

    return reply.status(200).send(
      ok({
        user: toUserResponse(user),
        token,
      }),
    );
  });
}
