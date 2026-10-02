import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { revokeAllSessionsForUser } from '../auth/sessionService.js';
import { authGuard } from '../middleware/authGuard.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { fail, ok } from '../utils/response.js';

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
  role: 'user' | 'admin';
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    created_at: user.createdAt.toISOString(),
  };
}

const userSelect = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
  createdAt: users.createdAt,
};

export async function usersRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.get('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
    }

    const { id } = parsedId.data;

    if (request.userId !== id) {
      return reply.status(401).send(fail('UNAUTHORIZED', 'Unauthorized', []));
    }

    const [user] = await db
      .select(userSelect)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!user) {
      return reply
        .status(404)
        .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
    }

    return reply.status(200).send(ok(toUserResponse(user)));
  });

  app.put('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
    }

    const { id } = parsedId.data;

    if (request.userId !== id) {
      return reply.status(401).send(fail('UNAUTHORIZED', 'Unauthorized', []));
    }

    const parsedBody = updateUserSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues));
    }

    const { name, email } = parsedBody.data;

    const [existing] = await db
      .select(userSelect)
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .limit(1);

    if (!existing) {
      return reply
        .status(404)
        .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
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
          .send(fail('CONFLICT', 'Email already registered', []));
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
        .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
    }

    return reply.status(200).send(ok({ user: toUserResponse(updated) }));
  });

  app.delete('/users/:id', async (request, reply) => {
    const parsedId = idParamSchema.safeParse(request.params);

    if (!parsedId.success) {
      return reply
        .status(400)
        .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
    }

    const { id } = parsedId.data;

    if (request.userId !== id) {
      return reply.status(401).send(fail('UNAUTHORIZED', 'Unauthorized', []));
    }

    const [deleted] = await db
      .update(users)
      .set({ deletedAt: sql`now()` })
      .where(and(eq(users.id, id), isNull(users.deletedAt)))
      .returning({ id: users.id });

    if (!deleted) {
      return reply
        .status(404)
        .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
    }

    // Revoke all sessions for self-deleted user
    await revokeAllSessionsForUser(id);

    return reply.status(200).send(ok({ success: true }));
  });
}
