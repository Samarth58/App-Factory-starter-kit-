import 'dotenv/config';
import { validateDatabaseUrl, validateTestSchema } from './helpers/dbGuard.js';
import { initDnsFallback } from './helpers/dnsFallback.js';

initDnsFallback();

const mainUrl = process.env.DATABASE_URL;
const testSchema = process.env.TEST_DB_SCHEMA || 'app_test';

// Worker-level verification guard before any src module is imported
validateDatabaseUrl(mainUrl);
validateTestSchema(testSchema);

// Set test isolation schema for the connection pool
process.env.DB_SCHEMA = testSchema;
