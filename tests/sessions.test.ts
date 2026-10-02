import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { pool } from '../src/db/connection.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  `test-session-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

async function registerUser(name = 'Session User') {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/register',
    payload: { email, password, name },
  });

  expect(res.statusCode).toBe(201);
  const body = res.json();

  return {
    email,
    user: body.data.user as {
      id: string;
      email: string;
      name: string | null;
      role: string;
      created_at: string;
    },
    token: body.data.token as string,
    refreshToken: body.data.refreshToken as string,
  };
}

describe('Sessions & Refresh Tokens', () => {
  it('1. register and login return a refreshToken, and access token works on protected route', async () => {
    const { user, token, refreshToken, email } = await registerUser('Test User 1');

    expect(refreshToken).toBeDefined();
    expect(typeof refreshToken).toBe('string');

    // Access token works on protected route
    const protectedRes = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(protectedRes.statusCode).toBe(200);
    expect(protectedRes.json().data.id).toBe(user.id);

    // Login also returns refreshToken
    const loginRes = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = loginRes.json();
    expect(loginBody.data).toHaveProperty('token');
    expect(loginBody.data).toHaveProperty('refreshToken');
    expect(typeof loginBody.data.refreshToken).toBe('string');
  });

  it('2. stored value is SHA-256 hash (64 hex chars) and not raw jti', async () => {
    const { user, refreshToken } = await registerUser('Hash Check User');

    const decoded = jwt.decode(refreshToken) as { jti: string; typ: string };
    expect(decoded).toBeDefined();
    expect(decoded.typ).toBe('refresh');
    expect(decoded.jti).toBeDefined();

    const dbRes = await pool.query(
      'SELECT jti_hash FROM user_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user.id],
    );

    expect(dbRes.rows.length).toBe(1);
    const storedHash = dbRes.rows[0].jti_hash as string;

    expect(storedHash).toHaveLength(64);
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedHash).not.toBe(decoded.jti);
  });

  it('3. rotation: POST /refresh returns a new pair and revokes the old session row', async () => {
    const { user, refreshToken: oldRefreshToken } = await registerUser('Rotation User');

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: oldRefreshToken },
    });

    expect(refreshRes.statusCode).toBe(200);
    const body = refreshRes.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('token');
    expect(body.data).toHaveProperty('accessToken');
    expect(body.data).toHaveProperty('refreshToken');
    expect(body.data.refreshToken).not.toBe(oldRefreshToken);

    // Verify old session row in DB has revoked_at set
    const oldDecoded = jwt.decode(oldRefreshToken) as { jti: string };
    const sessions = await pool.query(
      'SELECT revoked_at FROM user_sessions WHERE user_id = $1 ORDER BY created_at ASC',
      [user.id],
    );

    expect(sessions.rows.length).toBe(2);
    expect(sessions.rows[0].revoked_at).not.toBeNull();
    expect(sessions.rows[1].revoked_at).toBeNull();
  });

  it('4. replay OUTSIDE grace window (60s ago) returns 401 and revokes ALL user sessions', async () => {
    const { user, email } = await registerUser('Theft User');

    // Create a second login session for the same user
    const login2 = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });
    const session2RefreshToken = login2.json().data.refreshToken as string;

    // Rotate first session
    const firstUser = await registerUser('First User');
    const rotate1 = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: firstUser.refreshToken },
    });
    expect(rotate1.statusCode).toBe(200);

    // Set revoked_at to 60 seconds ago (outside 20s grace window)
    await pool.query(
      "UPDATE user_sessions SET revoked_at = now() - interval '60 seconds' WHERE user_id = $1 AND revoked_at IS NOT NULL",
      [firstUser.user.id],
    );

    // Replay the old token
    const replayRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: firstUser.refreshToken },
    });

    expect(replayRes.statusCode).toBe(401);
    expect(replayRes.json().error.code).toBe('UNAUTHORIZED');

    // Verify all sessions for firstUser are now revoked
    const checkSessions = await pool.query(
      'SELECT revoked_at FROM user_sessions WHERE user_id = $1',
      [firstUser.user.id],
    );
    expect(checkSessions.rows.every((row) => row.revoked_at !== null)).toBe(true);
  });

  it('5. replay INSIDE grace window returns 200 with new pair and does not revoke other sessions', async () => {
    const { user, email, refreshToken: originalToken } = await registerUser('Grace User');

    // Create a second active session for the same user
    const secondLogin = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email, password },
    });
    const secondSessionToken = secondLogin.json().data.refreshToken as string;

    // First rotation (revoked_at set to now)
    const rotateRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: originalToken },
    });
    expect(rotateRes.statusCode).toBe(200);

    // Immediate replay of originalToken (within 20s grace window)
    const replayGraceRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: originalToken },
    });

    expect(replayGraceRes.statusCode).toBe(200);
    const graceBody = replayGraceRes.json();
    expect(graceBody.success).toBe(true);
    expect(graceBody.data).toHaveProperty('accessToken');
    expect(graceBody.data).toHaveProperty('refreshToken');

    // Verify second login session is still active (not revoked)
    const secondRotate = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: secondSessionToken },
    });
    expect(secondRotate.statusCode).toBe(200);
  });

  it('6. concurrency: simultaneous /refresh calls with same token both succeed without 5xx', async () => {
    const { refreshToken } = await registerUser('Concurrent User');

    const [res1, res2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      }),
      app.inject({
        method: 'POST',
        url: '/refresh',
        payload: { refreshToken },
      }),
    ]);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(res1.json().success).toBe(true);
    expect(res2.json().success).toBe(true);
  });

  it('7. wrong token types: access token to /refresh -> 401; refresh token to protected route -> 401', async () => {
    const { user, token: accessToken, refreshToken } = await registerUser('Type Test User');

    // Access token sent to /refresh
    const refreshWithAccess = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: accessToken },
    });
    expect(refreshWithAccess.statusCode).toBe(401);
    expect(refreshWithAccess.json().error.code).toBe('UNAUTHORIZED');

    // Refresh token sent as Bearer token to protected route
    const protectedWithRefresh = await app.inject({
      method: 'GET',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${refreshToken}`,
      },
    });
    expect(protectedWithRefresh.statusCode).toBe(401);
    expect(protectedWithRefresh.json().error.code).toBe('UNAUTHORIZED');
  });

  it('8. expired refresh token and invalid signature return 401', async () => {
    const { user, refreshToken } = await registerUser('Expired Token User');

    // Set expires_at to the past
    await pool.query(
      "UPDATE user_sessions SET expires_at = now() - interval '1 day' WHERE user_id = $1",
      [user.id],
    );

    const expiredRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken },
    });
    expect(expiredRes.statusCode).toBe(401);

    // Token signed with wrong secret
    const fakeToken = jwt.sign(
      { userId: user.id, jti: 'fake-jti', typ: 'refresh' },
      'wrong-secret-key-1234567890',
      { algorithm: 'HS256', expiresIn: '30d' },
    );

    const fakeRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken: fakeToken },
    });
    expect(fakeRes.statusCode).toBe(401);
  });

  it('9. deleted user cannot refresh and sessions are revoked', async () => {
    const { user, token, refreshToken } = await registerUser('Deleted Refresh User');

    // Delete user
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(delRes.statusCode).toBe(200);

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken },
    });

    expect(refreshRes.statusCode).toBe(401);
    expect(refreshRes.json().error.code).toBe('UNAUTHORIZED');
  });

  it('10. logout revokes the session, subsequent refresh follows replay, logout twice succeeds', async () => {
    const { user, refreshToken } = await registerUser('Logout User');

    // Logout
    const logoutRes1 = await app.inject({
      method: 'POST',
      url: '/logout',
      payload: { refreshToken },
    });
    expect(logoutRes1.statusCode).toBe(200);
    expect(logoutRes1.json().success).toBe(true);

    // Calling logout twice succeeds (idempotent)
    const logoutRes2 = await app.inject({
      method: 'POST',
      url: '/logout',
      payload: { refreshToken },
    });
    expect(logoutRes2.statusCode).toBe(200);

    // Refreshing with revoked token follows replay logic:
    // Set revoked_at to 60s ago
    await pool.query(
      "UPDATE user_sessions SET revoked_at = now() - interval '60 seconds' WHERE user_id = $1",
      [user.id],
    );

    const refreshRes = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: { refreshToken },
    });
    expect(refreshRes.statusCode).toBe(401);
  });

  it('11. user self-deletion revokes all active sessions', async () => {
    const { user, token } = await registerUser('Self Delete Session User');

    // Check sessions exist and are active
    const activeSessionsBefore = await pool.query(
      'SELECT id FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [user.id],
    );
    expect(activeSessionsBefore.rows.length).toBeGreaterThan(0);

    // Self-delete
    const delRes = await app.inject({
      method: 'DELETE',
      url: `/users/${user.id}`,
      headers: {
        authorization: `Bearer ${token}`,
      },
    });
    expect(delRes.statusCode).toBe(200);

    // Check all sessions revoked
    const activeSessionsAfter = await pool.query(
      'SELECT id FROM user_sessions WHERE user_id = $1 AND revoked_at IS NULL',
      [user.id],
    );
    expect(activeSessionsAfter.rows.length).toBe(0);
  });

  it('12. validation rejects missing or invalid refreshToken body on /refresh and /logout', async () => {
    const invalidRefresh = await app.inject({
      method: 'POST',
      url: '/refresh',
      payload: {},
    });
    expect(invalidRefresh.statusCode).toBe(400);
    expect(invalidRefresh.json().error.code).toBe('VALIDATION_ERROR');

    const invalidLogout = await app.inject({
      method: 'POST',
      url: '/logout',
      payload: { refreshToken: '' },
    });
    expect(invalidLogout.statusCode).toBe(400);
    expect(invalidLogout.json().error.code).toBe('VALIDATION_ERROR');
  });
});
