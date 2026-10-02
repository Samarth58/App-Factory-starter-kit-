export type DbGuardResult = {
  valid: boolean;
  testDatabaseName: string;
};

export function parseDatabaseUrl(rawUrl: string): {
  hostname: string;
  port: string;
  database: string;
} {
  try {
    const parsed = new URL(rawUrl);
    let hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      hostname = 'localhost';
    }
    const port = parsed.port || '5432';
    const database = parsed.pathname.replace(/^\//, '').split('?')[0];

    if (!database) {
      throw new Error('Database name is missing in connection URL');
    }

    return { hostname, port, database };
  } catch (err) {
    if (
      err instanceof Error &&
      err.message === 'Database name is missing in connection URL'
    ) {
      throw err;
    }
    throw new Error('Invalid database connection URL format');
  }
}

export function validateTestDatabaseUrl(
  mainDbUrl: string | undefined,
  testDbUrl: string | undefined,
): DbGuardResult {
  if (!testDbUrl || typeof testDbUrl !== 'string' || testDbUrl.trim() === '') {
    throw new Error('TEST_DATABASE_URL is required and must be set');
  }

  const testParsed = parseDatabaseUrl(testDbUrl);

  if (
    !testParsed.database ||
    !testParsed.database.toLowerCase().includes('test')
  ) {
    throw new Error('TEST_DATABASE_URL database name must contain "test"');
  }

  if (mainDbUrl && typeof mainDbUrl === 'string' && mainDbUrl.trim() !== '') {
    const mainParsed = parseDatabaseUrl(mainDbUrl);
    if (
      mainParsed.hostname === testParsed.hostname &&
      mainParsed.port === testParsed.port &&
      mainParsed.database === testParsed.database
    ) {
      throw new Error(
        'TEST_DATABASE_URL must not point to the same database as DATABASE_URL',
      );
    }
  }

  return {
    valid: true,
    testDatabaseName: testParsed.database,
  };
}

export async function verifyTestDatabaseConnection(
  pool: { query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }> },
  testDbUrl: string | undefined,
): Promise<void> {
  if (!testDbUrl || typeof testDbUrl !== 'string') {
    throw new Error('TEST_DATABASE_URL is not configured');
  }

  const { database: expectedDbName } = parseDatabaseUrl(testDbUrl);

  const res = await pool.query('SELECT current_database() AS current_db');
  const actualDbName = (res.rows[0]?.current_db as string) || '';

  if (!actualDbName || !actualDbName.toLowerCase().includes('test')) {
    throw new Error(
      'Safety check failed: connected database name does not contain "test"',
    );
  }

  if (actualDbName !== expectedDbName) {
    throw new Error(
      'Safety check failed: connected database does not match expected test database',
    );
  }
}
