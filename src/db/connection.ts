import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../config/env.js';

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
const schema = process.env.DB_SCHEMA;

const pool = new Pool({
  connectionString,
  ...(schema ? { options: `-c search_path=${schema}` } : {}),
});
const db = drizzle(pool);

export { db, pool };
