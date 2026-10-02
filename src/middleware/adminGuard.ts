import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { verifyAccessToken } from '../auth/jwt.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';

function unauthorized(message = 'Unauthorized'): never {
  const error = new Error(message) as FastifyError;
  error.statusCode = 401;
  error.code = 'UNAUTHORIZED';
  throw error;
}

function forbidden(message = 'Forbidden: Admin access required'): never {
  const error = new Error(message) as FastifyError;
  error.statusCode = 403;
  error.code = 'FORBIDDEN';
  throw error;
}

export async function adminGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!request.userId) {
    const authorization = request.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      unauthorized();
    }

    const token = authorization.slice('Bearer '.length);

    try {
      const payload = verifyAccessToken(token);
      request.userId = payload.userId;
    } catch {
      unauthorized();
    }
  }

  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      deletedAt: users.deletedAt,
    })
    .from(users)
    .where(
      and(
        eq(users.id, request.userId),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);

  if (!user) {
    unauthorized();
  }

  if (user.role !== 'admin') {
    forbidden();
  }
}
