import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { revokeAllSessionsForUser } from '../auth/sessionService.js';
import { adminGuard } from '../middleware/adminGuard.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';
import { fail, ok } from '../utils/response.js';

const idParamSchema = z.object({
  id: z.string().uuid(),
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

const updateRoleSchema = z
  .object({
    role: z.enum(['user', 'admin']),
  })
  .strict();

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', adminGuard);

  app.get(
    '/admin/users',
    {
      schema: {
        tags: ['Admin'],
        summary: 'List all users',
        description: 'Retrieves a list of all active users. Requires admin role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request, reply) => {
      const userList = await db
        .select(userSelect)
        .from(users)
        .where(isNull(users.deletedAt));

      return reply.status(200).send(ok(userList.map(toUserResponse)));
    },
  );

  app.get(
    '/admin/users/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Get user details by ID',
        description:
          'Retrieves user details by ID for administrative inspection. Requires admin role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
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
          .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
      }

      return reply.status(200).send(ok(toUserResponse(user)));
    },
  );

  app.patch(
    '/admin/users/:id/role',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Update user role',
        description:
          'Updates a target user role between user and admin with demotion safety checks. Requires admin role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
      }

      const parsedBody = updateRoleSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues));
      }

      const { id } = parsedId.data;
      const { role } = parsedBody.data;

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

      // Safety checks: Prevent self-demotion or demoting the last remaining admin
      if (user.role === 'admin' && role === 'user') {
        if (request.userId === id) {
          return reply
            .status(400)
            .send(
              fail(
                'VALIDATION_ERROR',
                'Cannot demote your own administrator account',
                [],
              ),
            );
        }

        const activeAdmins = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)));

        const count = Number(activeAdmins[0]?.count ?? 0);
        if (count <= 1) {
          return reply
            .status(400)
            .send(
              fail('VALIDATION_ERROR', 'Cannot demote the last remaining admin', []),
            );
        }
      }

      const [updated] = await db
        .update(users)
        .set({ role })
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning(userSelect);

      if (!updated) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
      }

      return reply.status(200).send(ok(toUserResponse(updated)));
    },
  );

  app.post(
    '/admin/users/:id/revoke-sessions',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Revoke user sessions',
        description:
          'Revokes all active sessions and refresh tokens for the target user. Requires admin role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
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
          .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
      }

      await revokeAllSessionsForUser(id);

      return reply.status(200).send(ok({ success: true }));
    },
  );

  app.delete(
    '/admin/users/:id',
    {
      schema: {
        tags: ['Admin'],
        summary: 'Soft-delete user',
        description:
          'Soft-deletes the target user and revokes all their active sessions. Requires admin role.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid user id', parsedId.error.issues));
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
          .send(fail('RESOURCE_NOT_FOUND', 'User not found', []));
      }

      // Revoke all sessions for deleted user
      await revokeAllSessionsForUser(id);

      return reply.status(200).send(ok({ success: true }));
    },
  );
}
