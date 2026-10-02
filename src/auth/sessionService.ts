import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyError } from 'fastify';
import { db } from '../db/connection.js';
import { userSessions, users } from '../db/schema.js';
import {
  generateJti,
  sha256Hex,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from './jwt.js';

export const REFRESH_REUSE_GRACE_SECONDS = 20;

function createUnauthorizedError(message = 'Unauthorized'): FastifyError {
  const error = new Error(message) as FastifyError;
  error.statusCode = 401;
  error.code = 'UNAUTHORIZED';
  return error;
}

export async function createSession(userId: string): Promise<{
  refreshToken: string;
  sessionId: string;
}> {
  const jti = generateJti();
  const jtiHash = sha256Hex(jti);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [session] = await db
    .insert(userSessions)
    .values({
      userId,
      jtiHash,
      expiresAt,
      createdAt: new Date(),
    })
    .returning({ id: userSessions.id });

  const refreshToken = signRefreshToken(userId, jti);

  return {
    refreshToken,
    sessionId: session.id,
  };
}

export async function rotateSession(refreshTokenString: string): Promise<{
  accessToken: string;
  refreshToken: string;
  token: string;
}> {
  let payload: { userId: string; jti: string; typ: 'refresh' };
  try {
    payload = verifyRefreshToken(refreshTokenString);
  } catch {
    throw createUnauthorizedError('Invalid refresh token');
  }

  const jtiHash = sha256Hex(payload.jti);

  const result = await db.transaction(async (tx) => {
    // Select the session row with FOR UPDATE for concurrency serialization
    const [session] = await tx
      .select()
      .from(userSessions)
      .where(eq(userSessions.jtiHash, jtiHash))
      .for('update')
      .limit(1);

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw createUnauthorizedError('Session expired or not found');
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);

    if (!user || user.deletedAt !== null) {
      return { success: false as const, reason: 'user_deleted' as const, userId: session.userId };
    }

    const now = new Date();

    if (session.revokedAt === null) {
      // Normal rotation: revoke old session, mint new session & token pair
      await tx
        .update(userSessions)
        .set({ revokedAt: now })
        .where(eq(userSessions.id, session.id));

      const newJti = generateJti();
      const newJtiHash = sha256Hex(newJti);
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.insert(userSessions).values({
        userId: user.id,
        jtiHash: newJtiHash,
        expiresAt: newExpiresAt,
        createdAt: now,
      });

      const accessToken = signAccessToken(user.id);
      const newRefreshToken = signRefreshToken(user.id, newJti);

      return {
        success: true as const,
        accessToken,
        refreshToken: newRefreshToken,
        token: accessToken,
      };
    }

    // Session is already revoked -> Replay detection logic
    const diffSeconds = (now.getTime() - session.revokedAt.getTime()) / 1000;

    if (diffSeconds <= REFRESH_REUSE_GRACE_SECONDS) {
      // Grace window path: concurrent mobile retry
      console.warn(
        JSON.stringify({
          event: 'refresh_grace_reuse',
          userId: user.id,
        }),
      );

      const newJti = generateJti();
      const newJtiHash = sha256Hex(newJti);
      const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await tx.insert(userSessions).values({
        userId: user.id,
        jtiHash: newJtiHash,
        expiresAt: newExpiresAt,
        createdAt: now,
      });

      const accessToken = signAccessToken(user.id);
      const newRefreshToken = signRefreshToken(user.id, newJti);

      return {
        success: true as const,
        accessToken,
        refreshToken: newRefreshToken,
        token: accessToken,
      };
    }

    // Suspected token theft (outside grace window): revoke all user sessions
    return { success: false as const, reason: 'theft' as const, userId: user.id };
  });

  if (!result.success) {
    if (result.reason === 'theft') {
      console.warn(
        JSON.stringify({
          event: 'refresh_reuse_detected',
          userId: result.userId,
        }),
      );
      await revokeAllSessionsForUser(result.userId);
      throw createUnauthorizedError('Refresh token reuse detected');
    }

    if (result.reason === 'user_deleted') {
      await revokeAllSessionsForUser(result.userId);
      throw createUnauthorizedError('User not found or deleted');
    }
  }

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    token: result.token,
  };
}

export async function revokeSession(refreshTokenString: string): Promise<void> {
  let payload: { userId: string; jti: string; typ: 'refresh' };
  try {
    payload = verifyRefreshToken(refreshTokenString);
  } catch {
    throw createUnauthorizedError('Invalid refresh token');
  }

  const jtiHash = sha256Hex(payload.jti);

  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.jtiHash, jtiHash),
        isNull(userSessions.revokedAt),
      ),
    );
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.revokedAt),
      ),
    );
}
