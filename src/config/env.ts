import 'dotenv/config';
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  CORS_ENABLED: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (['false', '0', 'off', 'no'].includes(lower)) return false;
        if (['true', '1', 'on', 'yes'].includes(lower)) return true;
      }
      return val;
    }, z.boolean())
    .default(true),
  CORS_ORIGIN: z
    .string()
    .default('http://localhost:3000,http://localhost:5173,http://localhost:8081,http://localhost:19006'),
  CORS_CREDENTIALS: z
    .preprocess((val) => {
      if (typeof val === 'boolean') return val;
      if (typeof val === 'string') {
        const lower = val.trim().toLowerCase();
        if (['false', '0', 'off', 'no'].includes(lower)) return false;
        if (['true', '1', 'on', 'yes'].includes(lower)) return true;
      }
      return val;
    }, z.boolean())
    .default(true),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(input: Record<string, unknown> = process.env): Env {
  const result = envSchema.safeParse(input);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new Error(`Invalid environment configuration: ${errorDetails}`);
  }

  return result.data;
}

export const env = validateEnv();
