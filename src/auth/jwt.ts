import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '15m' });
}

export function verifyToken(token: string): { userId: string } {
  const payload = jwt.verify(token, env.JWT_SECRET);

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('userId' in payload) ||
    typeof payload.userId !== 'string'
  ) {
    throw new Error('Invalid token');
  }

  return { userId: payload.userId };
}
