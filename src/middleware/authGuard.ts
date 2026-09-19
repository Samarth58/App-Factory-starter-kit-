import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { verifyToken } from '../auth/jwt.js';

function unauthorized(): never {
  const error = new Error('Unauthorized') as FastifyError;
  error.statusCode = 401;
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
}
