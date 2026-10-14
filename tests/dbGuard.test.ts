import { describe, expect, it } from 'vitest';
import {
  adaptMigrationSqlForTestSchema,
  parseDatabaseUrl,
  validateDatabaseUrl,
  validateTestSchema,
  verifyTableSchemasBeforeTruncation,
  verifyTestDatabaseConnection,
} from './helpers/dbGuard.js';

describe('Database Safety Guard (dbGuard)', () => {
  describe('parseDatabaseUrl', () => {
    it('parses postgresql URL components accurately', () => {
      const parsed = parseDatabaseUrl(
        'postgresql://postgres:secret@localhost:5432/my_test_db?sslmode=disable',
      );
      expect(parsed.hostname).toBe('localhost');
      expect(parsed.port).toBe('5432');
      expect(parsed.database).toBe('my_test_db');
    });

    it('normalizes 127.0.0.1 and ::1 to localhost', () => {
      const parsedIp = parseDatabaseUrl(
        'postgresql://postgres:secret@127.0.0.1:5432/test_db',
      );
      const parsedIpv6 = parseDatabaseUrl(
        'postgresql://postgres:secret@[::1]:5432/test_db',
      );
      expect(parsedIp.hostname).toBe('localhost');
      expect(parsedIpv6.hostname).toBe('localhost');
    });

    it('throws error for invalid URL format', () => {
      expect(() => parseDatabaseUrl('not-a-url')).toThrowError(
        'Invalid database connection URL format',
      );
    });

    it('throws error when database name is missing in pathname', () => {
      expect(() => parseDatabaseUrl('postgresql://localhost:5432/')).toThrowError(
        'Database name is missing in connection URL',
      );
    });
  });

  describe('validateDatabaseUrl', () => {
    it('accepts a valid DATABASE_URL', () => {
      const result = validateDatabaseUrl(
        'postgresql://postgres:secret@localhost:5432/app_db',
      );
      expect(result.valid).toBe(true);
      expect(result.database).toBe('app_db');
    });

    it('rejects missing or empty DATABASE_URL', () => {
      expect(() => validateDatabaseUrl(undefined)).toThrowError(
        'DATABASE_URL is required and must be set',
      );

      expect(() => validateDatabaseUrl('')).toThrowError(
        'DATABASE_URL is required and must be set',
      );
    });
  });

  describe('validateTestSchema', () => {
    it('accepts a valid test schema name containing "test"', () => {
      const result = validateTestSchema('app_test');
      expect(result.valid).toBe(true);
      expect(result.schemaName).toBe('app_test');

      const customResult = validateTestSchema('my_test_schema');
      expect(customResult.valid).toBe(true);
      expect(customResult.schemaName).toBe('my_test_schema');
    });

    it('rejects missing or empty test schema name', () => {
      expect(() => validateTestSchema(undefined)).toThrowError(
        'Test schema name is required and must be set',
      );
      expect(() => validateTestSchema('')).toThrowError(
        'Test schema name is required and must be set',
      );
    });

    it('strictly rejects "public" schema to prevent accidental production/dev mutation', () => {
      expect(() => validateTestSchema('public')).toThrowError(
        "Test schema cannot be 'public'. Tests are strictly forbidden from running against the public schema.",
      );
      expect(() => validateTestSchema('PUBLIC')).toThrowError(
        "Test schema cannot be 'public'. Tests are strictly forbidden from running against the public schema.",
      );
    });

    it('rejects schema names that do not contain "test"', () => {
      expect(() => validateTestSchema('production')).toThrowError(
        'Test schema name must contain "test"',
      );
      expect(() => validateTestSchema('app_staging')).toThrowError(
        'Test schema name must contain "test"',
      );
    });

    it('rejects invalid SQL identifiers', () => {
      expect(() => validateTestSchema('test-schema')).toThrowError(
        'Test schema name must be a valid SQL identifier',
      );
      expect(() => validateTestSchema('test; drop table users;')).toThrowError(
        'Test schema name must be a valid SQL identifier',
      );
    });
  });

  describe('verifyTestDatabaseConnection (First-Connection Safety Check)', () => {
    it('passes when connected schema matches expected test schema and contains test', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_schema: 'app_test', current_db: 'app_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(mockPool, 'app_test'),
      ).resolves.toBeUndefined();
    });

    it('strictly aborts when connected schema is public', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_schema: 'public', current_db: 'app_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(mockPool, 'app_test'),
      ).rejects.toThrowError(
        "Safety check failed: connected to 'public' schema. Tests are strictly forbidden from running against public schema.",
      );
    });

    it('aborts when connected schema does not match expected test schema', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_schema: 'other_test', current_db: 'app_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(mockPool, 'app_test'),
      ).rejects.toThrowError(
        'Safety check failed: connected schema "other_test" does not match expected test schema "app_test"',
      );
    });

    it('aborts when connected schema does not contain test', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_schema: 'main_schema', current_db: 'app_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(mockPool, 'app_test'),
      ).rejects.toThrowError(
        'Safety check failed: connected schema name does not contain "test"',
      );
    });
  });

  describe('verifyTableSchemasBeforeTruncation', () => {
    it('passes when all target tables belong to the verified test schema', () => {
      const rows = [
        { schemaname: 'app_test', tablename: 'users' },
        { schemaname: 'app_test', tablename: 'user_sessions' },
        { schemaname: 'app_test', tablename: 'examples' },
      ];
      expect(() => verifyTableSchemasBeforeTruncation(rows, 'app_test')).not.toThrow();
    });

    it('aborts immediately if any table belongs to public schema', () => {
      const rows = [
        { schemaname: 'app_test', tablename: 'users' },
        { schemaname: 'public', tablename: 'real_users' },
      ];
      expect(() => verifyTableSchemasBeforeTruncation(rows, 'app_test')).toThrowError(
        'Safety check failed: cannot truncate table "public"."real_users". Public schema tables can never be truncated in tests.',
      );
    });

    it('aborts immediately if any table does not match the verified test schema', () => {
      const rows = [
        { schemaname: 'app_test', tablename: 'users' },
        { schemaname: 'other_schema', tablename: 'foreign_table' },
      ];
      expect(() => verifyTableSchemasBeforeTruncation(rows, 'app_test')).toThrowError(
        'Safety check failed: cannot truncate table "other_schema"."foreign_table". Table schema does not match verified test schema "app_test".',
      );
    });
  });

  describe('adaptMigrationSqlForTestSchema', () => {
    it('rewrites quoted REFERENCES "public". to test schema', () => {
      const sql = 'ALTER TABLE "user_sessions" ADD CONSTRAINT "fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");';
      const adapted = adaptMigrationSqlForTestSchema(sql, 'app_test');
      expect(adapted).toBe(
        'ALTER TABLE "user_sessions" ADD CONSTRAINT "fk" FOREIGN KEY ("user_id") REFERENCES "app_test"."users"("id");',
      );
    });

    it('rewrites unquoted REFERENCES public. to test schema', () => {
      const sql = 'ALTER TABLE user_sessions ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES public.users(id);';
      const adapted = adaptMigrationSqlForTestSchema(sql, 'app_test');
      expect(adapted).toBe(
        'ALTER TABLE user_sessions ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES "app_test".users(id);',
      );
    });

    it('leaves statements without public references unchanged', () => {
      const sql = 'CREATE TABLE "users" ("id" uuid PRIMARY KEY);';
      const adapted = adaptMigrationSqlForTestSchema(sql, 'app_test');
      expect(adapted).toBe(sql);
    });
  });
});
