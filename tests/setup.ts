import 'dotenv/config';
import { beforeAll, beforeEach } from 'vitest';
import {
  validateTestSchema,
  verifyTableSchemasBeforeTruncation,
  verifyTestDatabaseConnection,
} from './helpers/dbGuard.js';
import { pool } from '../src/db/connection.js';

const testSchema = process.env.TEST_DB_SCHEMA || 'app_test';
validateTestSchema(testSchema);

let safetyCheckPassed = false;

beforeAll(async () => {
  // First-connection safety check BEFORE any table truncation or write
  await verifyTestDatabaseConnection(pool, testSchema);
  safetyCheckPassed = true;
});

beforeEach(async () => {
  if (!safetyCheckPassed) {
    await verifyTestDatabaseConnection(pool, testSchema);
    safetyCheckPassed = true;
  }

  // Query explicit application tables strictly within testSchema (NEVER drizzle migrations table)
  const appTables = ['examples', 'categories', 'user_sessions', 'users'];
  const { rows } = await pool.query<{ schemaname: string; tablename: string }>(
    `SELECT schemaname, tablename FROM pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])`,
    [testSchema, appTables],
  );

  if (rows.length > 0) {
    // Requirement 4: Verify the schema of every table before truncating it
    verifyTableSchemasBeforeTruncation(rows, testSchema);

    // Requirement 3: Do not rely on search_path alone - explicitly schema-qualify all truncated tables
    const tableList = rows.map((r) => `"${testSchema}"."${r.tablename}"`).join(', ');
    await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE;`);
  }
});


