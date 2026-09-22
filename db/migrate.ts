import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../src/config/env.js';

const pool = new Pool({ connectionString: env.DATABASE_URL });
const db = drizzle(pool);

try {
  await migrate(db, { migrationsFolder: './drizzle' });
} catch (error) {
  console.error('Migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
