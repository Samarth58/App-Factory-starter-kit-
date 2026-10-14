import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import {
  adaptMigrationSqlForTestSchema,
  validateDatabaseUrl,
  validateTestSchema,
  verifyTestDatabaseConnection,
} from './helpers/dbGuard.js';
import { initDnsFallback } from './helpers/dnsFallback.js';

initDnsFallback();

export async function setup() {
  const mainUrl = process.env.DATABASE_URL;
  const testSchema = process.env.TEST_DB_SCHEMA || 'app_test';

  // Enforce safety guards before any database action
  validateDatabaseUrl(mainUrl);
  validateTestSchema(testSchema);

  // Set DB_SCHEMA so any connection inherits the isolated schema
  process.env.DB_SCHEMA = testSchema;

  const pool = new Pool({
    connectionString: mainUrl,
    options: `-c search_path=${testSchema}`,
  });

  try {
    // 1. Create isolated test schema if it does not exist
    await pool.query(`CREATE SCHEMA IF NOT EXISTS "${testSchema}";`);

    // 2. First-connection safety check: verify active schema is testSchema and NOT public
    await verifyTestDatabaseConnection(pool, testSchema);

    // 3. Create isolated migrations tracking table inside testSchema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${testSchema}"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      );
    `);

    // 4. Fetch the latest applied migration from testSchema
    const { rows: dbMigrations } = await pool.query<{ created_at: string }>(
      `SELECT created_at FROM "${testSchema}"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1;`,
    );
    const lastDbMigration = dbMigrations[0];
    const lastWhen = lastDbMigration ? Number(lastDbMigration.created_at) : -1;

    // 5. Read journal from ./drizzle/meta/_journal.json
    const journalPath = path.resolve('./drizzle/meta/_journal.json');
    if (!fs.existsSync(journalPath)) {
      throw new Error(`Can't find meta/_journal.json file at ${journalPath}`);
    }

    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: Array<{ idx: number; when: number; tag: string }>;
    };

    // 6. Apply unapplied migrations into testSchema with adapted foreign keys
    const client = await pool.connect();
    try {
      for (const entry of journal.entries) {
        if (entry.when > lastWhen) {
          const migrationPath = path.resolve(`./drizzle/${entry.tag}.sql`);
          if (!fs.existsSync(migrationPath)) {
            throw new Error(`Migration file not found: ${migrationPath}`);
          }

          const rawSql = fs.readFileSync(migrationPath, 'utf8');
          // Adapt foreign keys: REFERENCES "public". -> REFERENCES "app_test".
          const adaptedSql = adaptMigrationSqlForTestSchema(rawSql, testSchema);
          const statements = adaptedSql
            .split('--> statement-breakpoint')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

          await client.query('BEGIN');
          try {
            await client.query(`SET search_path TO "${testSchema}";`);
            for (const stmt of statements) {
              await client.query(stmt);
            }
            await client.query(
              `INSERT INTO "${testSchema}"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2);`,
              ['applied', entry.when],
            );
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          }
        }
      }
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}
