import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import {
  validateTestDatabaseUrl,
  verifyTestDatabaseConnection,
} from './helpers/dbGuard.js';

export async function setup() {
  const mainUrl = process.env.DATABASE_URL;
  const testUrl = process.env.TEST_DATABASE_URL;

  // Enforce the safety guard before any database action
  validateTestDatabaseUrl(mainUrl, testUrl);

  // Note: process.env.DATABASE_URL must NOT be mutated in globalSetup because Vitest worker
  // processes inherit the main process environment. The worker-level mutation happens inside
  // tests/preSetup.ts after the worker guard verifies distinct database URLs.

  const pool = new Pool({ connectionString: testUrl });
  try {
    // First-connection safety check
    await verifyTestDatabaseConnection(pool, testUrl);

    const db = drizzle(pool);
    await migrate(db, { migrationsFolder: './drizzle' });
  } finally {
    await pool.end();
  }
}
