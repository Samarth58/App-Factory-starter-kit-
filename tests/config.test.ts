import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env.js';

describe('Environment Configuration', () => {
  it('valid environment variables produce a valid configuration', () => {
    const validConfig = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/app_db',
      JWT_SECRET: 'test-secret-key-12345',
    });

    expect(validConfig.NODE_ENV).toBe('production');
    expect(validConfig.PORT).toBe(8080);
    expect(validConfig.DATABASE_URL).toBe('postgresql://postgres:password@localhost:5432/app_db');
    expect(validConfig.JWT_SECRET).toBe('test-secret-key-12345');
  });

  it('applies sensible defaults for optional fields', () => {
    const configWithDefaults = validateEnv({
      DATABASE_URL: 'postgresql://postgres:password@localhost:5432/app_db',
      JWT_SECRET: 'test-secret-key-12345',
    });

    expect(configWithDefaults.NODE_ENV).toBe('development');
    expect(configWithDefaults.PORT).toBe(3000);
  });

  it('rejects missing required environment variables', () => {
    expect(() =>
      validateEnv({
        JWT_SECRET: 'test-secret',
      }),
    ).toThrowError(/DATABASE_URL/);

    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
      }),
    ).toThrowError(/JWT_SECRET/);
  });

  it('rejects invalid PORT values', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'test-secret',
        PORT: 'invalid-port',
      }),
    ).toThrowError(/PORT/);

    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'test-secret',
        PORT: '99999',
      }),
    ).toThrowError(/PORT/);
  });

  it('rejects invalid NODE_ENV values', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: 'postgresql://localhost:5432/db',
        JWT_SECRET: 'test-secret',
        NODE_ENV: 'staging',
      }),
    ).toThrowError(/NODE_ENV/);
  });
});
