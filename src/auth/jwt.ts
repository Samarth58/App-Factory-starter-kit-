import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = {
  userId: string;
  typ: 'access';
};

export type RefreshTokenPayload = {
  userId: string;
  jti: string;
  typ: 'refresh';
};

export function sha256Hex(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function generateJti(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function signAccessToken(userId: string): string {
  return jwt.sign(
    { userId, typ: 'access' },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
}

export const signToken = signAccessToken;

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign(
    { userId, jti, typ: 'refresh' },
    env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '30d' },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as JwtPayload | string;

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('userId' in payload) ||
    typeof payload.userId !== 'string' ||
    !('typ' in payload) ||
    payload.typ !== 'access'
  ) {
    throw new Error('Invalid access token');
  }

  return { userId: payload.userId, typ: 'access' };
}

export const verifyToken = verifyAccessToken;

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ['HS256'],
  }) as JwtPayload | string;

  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('userId' in payload) ||
    typeof payload.userId !== 'string' ||
    !('jti' in payload) ||
    typeof payload.jti !== 'string' ||
    !('typ' in payload) ||
    payload.typ !== 'refresh'
  ) {
    throw new Error('Invalid refresh token');
  }

  return {
    userId: payload.userId,
    jti: payload.jti,
    typ: 'refresh',
  };
}
