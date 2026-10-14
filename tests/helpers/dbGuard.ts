export type DbGuardResult = {
  valid: boolean;
  database: string;
};

export type SchemaGuardResult = {
  valid: boolean;
  schemaName: string;
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

export function validateDatabaseUrl(dbUrl: string | undefined): DbGuardResult {
  if (!dbUrl || typeof dbUrl !== 'string' || dbUrl.trim() === '') {
    throw new Error('DATABASE_URL is required and must be set');
  }

  const parsed = parseDatabaseUrl(dbUrl);
  return {
    valid: true,
    database: parsed.database,
  };
}

export function validateTestSchema(schemaName: string | undefined): SchemaGuardResult {
  if (!schemaName || typeof schemaName !== 'string' || schemaName.trim() === '') {
    throw new Error('Test schema name is required and must be set');
  }

  const normalized = schemaName.trim().toLowerCase();

  if (normalized === 'public') {
    throw new Error(
      "Test schema cannot be 'public'. Tests are strictly forbidden from running against the public schema.",
    );
  }

  if (!normalized.includes('test')) {
    throw new Error('Test schema name must contain "test"');
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(normalized)) {
    throw new Error('Test schema name must be a valid SQL identifier');
  }

  return {
    valid: true,
    schemaName: normalized,
  };
}

export async function verifyTestDatabaseConnection(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
  expectedSchema: string,
): Promise<void> {
  const { schemaName: validatedSchema } = validateTestSchema(expectedSchema);

  const res = await pool.query('SELECT current_schema() AS current_schema, current_database() AS current_db');
  const actualSchema = ((res.rows[0]?.current_schema as string) || '').trim().toLowerCase();

  if (!actualSchema || actualSchema === 'public') {
    throw new Error(
      "Safety check failed: connected to 'public' schema. Tests are strictly forbidden from running against public schema.",
    );
  }

  if (!actualSchema.includes('test')) {
    throw new Error(
      'Safety check failed: connected schema name does not contain "test"',
    );
  }

  if (actualSchema !== validatedSchema) {
    throw new Error(
      `Safety check failed: connected schema "${actualSchema}" does not match expected test schema "${validatedSchema}"`,
    );
  }
}

export function verifyTableSchemasBeforeTruncation(
  rows: Array<{ schemaname: string; tablename: string }>,
  expectedSchema: string,
): void {
  const { schemaName: validatedSchema } = validateTestSchema(expectedSchema);

  for (const row of rows) {
    const rowSchema = (row.schemaname || '').trim().toLowerCase();
    if (rowSchema === 'public') {
      throw new Error(
        `Safety check failed: cannot truncate table "${row.schemaname}"."${row.tablename}". Public schema tables can never be truncated in tests.`,
      );
    }

    if (rowSchema !== validatedSchema) {
      throw new Error(
        `Safety check failed: cannot truncate table "${row.schemaname}"."${row.tablename}". Table schema does not match verified test schema "${validatedSchema}".`,
      );
    }
  }
}

export function adaptMigrationSqlForTestSchema(
  sqlContent: string,
  testSchema: string,
): string {
  const { schemaName: validatedSchema } = validateTestSchema(testSchema);
  return sqlContent.replace(/REFERENCES\s+("public"|public)\./gi, `REFERENCES "${validatedSchema}".`);
}
