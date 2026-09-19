import 'dotenv/config';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is missing or empty');
}

const jwtSecret: string = process.env.JWT_SECRET;

export function signToken(userId: string): string {
  return jwt.sign({ userId }, jwtSecret, { expiresIn: '15m' });
}

export function verifyToken(token: string): { userId: string } {
  const payload = jwt.verify(token, jwtSecret);

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
