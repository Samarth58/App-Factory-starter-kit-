import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '../auth/jwt.js';
import { db } from '../db/connection.js';
import { users } from '../db/schema.js';

function unauthorized(): never {
  const error = new Error('Unauthorized') as FastifyError;
  error.statusCode = 401;
  error.code = 'UNAUTHORIZED';
  throw error;
}

export async function authGuard(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    unauthorized();
  }

  const token = authorization.slice('Bearer '.length);

  try {
    const payload = verifyToken(token);
    request.userId = payload.userId;
  } catch {
    unauthorized();
  }

  const [user] = await db
    .select()
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
}
