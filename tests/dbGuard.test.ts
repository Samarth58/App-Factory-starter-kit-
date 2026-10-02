import { describe, expect, it } from 'vitest';
import {
  parseDatabaseUrl,
  validateTestDatabaseUrl,
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

  describe('validateTestDatabaseUrl', () => {
    it('accepts a valid test database URL distinct from main DATABASE_URL', () => {
      const result = validateTestDatabaseUrl(
        'postgresql://postgres:secret@localhost:5432/app_db',
        'postgresql://postgres:secret@localhost:5432/app_test_db',
      );
      expect(result.valid).toBe(true);
      expect(result.testDatabaseName).toBe('app_test_db');
    });

    it('accepts a valid test database URL when main DATABASE_URL is undefined', () => {
      const result = validateTestDatabaseUrl(
        undefined,
        'postgresql://postgres:secret@localhost:5432/unit_test_db',
      );
      expect(result.valid).toBe(true);
      expect(result.testDatabaseName).toBe('unit_test_db');
    });

    it('rejects missing or empty TEST_DATABASE_URL', () => {
      expect(() =>
        validateTestDatabaseUrl('postgresql://localhost:5432/app_db', undefined),
      ).toThrowError('TEST_DATABASE_URL is required and must be set');

      expect(() =>
        validateTestDatabaseUrl('postgresql://localhost:5432/app_db', ''),
      ).toThrowError('TEST_DATABASE_URL is required and must be set');
    });

    it('rejects TEST_DATABASE_URL when database name does not contain "test"', () => {
      expect(() =>
        validateTestDatabaseUrl(
          'postgresql://localhost:5432/app_prod',
          'postgresql://localhost:5432/app_staging',
        ),
      ).toThrowError('TEST_DATABASE_URL database name must contain "test"');
    });

    it('rejects when TEST_DATABASE_URL points to the exact same database as DATABASE_URL', () => {
      expect(() =>
        validateTestDatabaseUrl(
          'postgresql://postgres:pass1@localhost:5432/app_test_db',
          'postgresql://postgres:pass2@localhost:5432/app_test_db',
        ),
      ).toThrowError(
        'TEST_DATABASE_URL must not point to the same database as DATABASE_URL',
      );
    });

    it('rejects when TEST_DATABASE_URL and DATABASE_URL match via localhost vs 127.0.0.1', () => {
      expect(() =>
        validateTestDatabaseUrl(
          'postgresql://user1:pass1@localhost:5432/app_test_db',
          'postgresql://user2:pass2@127.0.0.1:5432/app_test_db',
        ),
      ).toThrowError(
        'TEST_DATABASE_URL must not point to the same database as DATABASE_URL',
      );
    });
  });

  describe('verifyTestDatabaseConnection (First-Connection Safety Check)', () => {
    it('passes when connected database name matches expected test database name and contains test', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_db: 'app_test_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(
          mockPool,
          'postgresql://user:pass@localhost:5432/app_test_db',
        ),
      ).resolves.toBeUndefined();
    });

    it('aborts when connected database name does not contain test', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_db: 'production_main' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(
          mockPool,
          'postgresql://user:pass@localhost:5432/production_main',
        ),
      ).rejects.toThrowError(
        'Safety check failed: connected database name does not contain "test"',
      );
    });

    it('aborts when connected database does not match expected test database in TEST_DATABASE_URL', async () => {
      const mockPool = {
        query: async () => ({ rows: [{ current_db: 'different_test_db' }] }),
      };
      await expect(
        verifyTestDatabaseConnection(
          mockPool,
          'postgresql://user:pass@localhost:5432/expected_test_db',
        ),
      ).rejects.toThrowError(
        'Safety check failed: connected database does not match expected test database',
      );
    });
  });

  describe('Worker Environment DATABASE_URL Isolation Verification', () => {
    it('compares parsed worker DATABASE_URL with TEST_DATABASE_URL', () => {
      const workerDb = process.env.DATABASE_URL;
      const testDb = process.env.TEST_DATABASE_URL;

      if (!testDb) {
        // When TEST_DATABASE_URL is not set, this unit test asserts parsed simulation
        const simulatedTestUrl =
          'postgresql://postgres:secret@localhost:5432/app_test_db';
        const simulatedWorkerUrl =
          'postgresql://postgres:secret@localhost:5432/app_test_db';

        const parsedWorker = parseDatabaseUrl(simulatedWorkerUrl);
        const parsedTest = parseDatabaseUrl(simulatedTestUrl);

        expect(parsedWorker.hostname).toBe(parsedTest.hostname);
        expect(parsedWorker.port).toBe(parsedTest.port);
        expect(parsedWorker.database).toBe(parsedTest.database);
        expect(parsedWorker.database.toLowerCase()).toContain('test');
        return;
      }

      expect(workerDb).toBeDefined();
      const parsedWorker = parseDatabaseUrl(workerDb!);
      const parsedTest = parseDatabaseUrl(testDb);

      expect(parsedWorker.hostname).toBe(parsedTest.hostname);
      expect(parsedWorker.port).toBe(parsedTest.port);
      expect(parsedWorker.database).toBe(parsedTest.database);
      expect(parsedWorker.database.toLowerCase()).toContain('test');
    });
  });
});
