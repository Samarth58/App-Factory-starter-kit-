import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/authGuard.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { error, success } from '../utils/response.js';

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const updateUserSchema = z
  .object({
    name: z.string().nullable().optional(),
    email: z.string().email().optional(),
  })
  .strict()
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: 'At least one field must be provided',
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

const userSelect = {
  id: users.id,
  email: users.email,
  name: users.name,
  createdAt: users.createdAt,
};

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.get('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(error('Invalid user id', 'VALIDATION_ERROR', 400));
    }

    const { id } = parsedId.data;

    const [user] = await db
      .select(userSelect)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return reply
        .status(404)
        .send(error('User not found', 'USER_NOT_FOUND', 404));
    }

    return reply.status(200).send(success(toUserResponse(user), 200));
  });

  app.put('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(error('Invalid user id', 'VALIDATION_ERROR', 400));
    }

    const parsedBody = updateUserSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply
        .status(400)
        .send(error('Invalid request body', 'VALIDATION_ERROR', 400));
    }

    const { id } = parsedId.data;
    const { name, email } = parsedBody.data;

    const [existing] = await db
      .select(userSelect)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!existing) {
      return reply
        .status(404)
        .send(error('User not found', 'USER_NOT_FOUND', 404));
    }

    if (email !== undefined) {
      const [duplicate] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(eq(users.email, email), isNull(users.deletedAt), ne(users.id, id)),
        )
        .limit(1);

      if (duplicate) {
        return reply
          .status(409)
          .send(error('Email already registered', 'EMAIL_EXISTS', 409));
      }
    }

    const updates: { name?: string | null; email?: string } = {};

    if (name !== undefined) {
      updates.name = name;
    }

    if (email !== undefined) {
      updates.email = email;
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning(userSelect);

    if (!updated) {
      return reply
        .status(404)
        .send(error('User not found', 'USER_NOT_FOUND', 404));
    }

    return reply.status(200).send(success({ user: toUserResponse(updated) }, 200));
  });

  app.delete('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(error('Invalid user id', 'VALIDATION_ERROR', 400));
    }

    const { id } = parsedId.data;

    const [deleted] = await db
      .update(users)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!deleted) {
      return reply
        .status(404)
        .send(error('User not found', 'USER_NOT_FOUND', 404));
    }

    return reply.status(200).send(success({ success: true }, 200));
  });
}
