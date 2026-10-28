import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const rawConnectionString = process.env.DATABASE_URL || env.DATABASE_URL;
// If using Neon pooled connection, unpool it for direct database connection & session option support
const connectionString = rawConnectionString?.includes('-pooler.')
  ? rawConnectionString.replace('-pooler.', '.')
  : rawConnectionString;
const schema = process.env.DB_SCHEMA;

const pool = new Pool({
  connectionString,
  ...(schema ? { options: `-c search_path=${schema}` } : {}),
});
const db = drizzle(pool);

export { db, pool };
