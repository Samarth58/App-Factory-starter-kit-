import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signToken } from '../auth/jwt.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { error, success } from '../utils/response.js';

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
        .send(error('Invalid request body', 'VALIDATION_ERROR', 400));
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
        .send(error('Email already registered', 'EMAIL_EXISTS', 409));
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
      success(
        {
          user: toUserResponse(user),
          token,
        },
        201,
      ),
    );
  });

  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply
        .status(400)
        .send(error('Invalid request body', 'VALIDATION_ERROR', 400));
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
        .send(error('Invalid email or password', 'INVALID_CREDENTIALS', 401));
    }

    const isValid = await verifyPassword(user.passwordHash, password);

    if (!isValid) {
      return reply
        .status(401)
        .send(error('Invalid email or password', 'INVALID_CREDENTIALS', 401));
    }

    const token = signToken(user.id);

    return reply.status(200).send(
      success(
        {
          user: toUserResponse(user),
          token,
        },
        200,
      ),
    );
  });
}
