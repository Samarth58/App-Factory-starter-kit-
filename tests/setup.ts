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
  await pool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE;');
});

afterAll(async () => {
  // Drain worker connection pool cleanly
  await pool.end();
});
