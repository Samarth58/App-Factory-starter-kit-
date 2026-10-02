import 'dotenv/config';
import { validateTestDatabaseUrl } from './helpers/dbGuard.js';
import { initDnsFallback } from './helpers/dnsFallback.js';

initDnsFallback();

const mainUrl = process.env.DATABASE_URL;
const testUrl = process.env.TEST_DATABASE_URL;

// Worker-level verification guard before any src module is imported
validateTestDatabaseUrl(mainUrl, testUrl);

if (testUrl) {
  process.env.DATABASE_URL = testUrl;
}
