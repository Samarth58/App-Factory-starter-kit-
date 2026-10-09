import 'dotenv/config';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { verifyTestDatabaseConnection } from './helpers/dbGuard.js';
import { pool } from '../src/db/connection.js';

const testUrl = process.env.TEST_DATABASE_URL;

let safetyCheckPassed = false;

beforeAll(async () => {
  // First-connection safety check BEFORE any table truncation or write
  await verifyTestDatabaseConnection(pool, testUrl);
  safetyCheckPassed = true;
});

beforeEach(async () => {
  if (!safetyCheckPassed) {
    await verifyTestDatabaseConnection(pool, testUrl);
    safetyCheckPassed = true;
  }
  // Truncate only explicit application tables (NEVER drizzle migrations table)
  const appTables = ['examples', 'categories', 'user_sessions', 'users'];
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = ANY($1::text[])`,
    [appTables],
  );
  if (rows.length > 0) {
    const tableList = rows.map((r) => `"${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
  }
});


