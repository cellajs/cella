import { env as dotenv } from '@dotenv-run/core';
import { appConfig } from 'shared';
import { z } from 'zod';

// Load .env from backend directory (same .env file, shared across monorepo)
dotenv({
  root: '../backend',
  files: ['.env'],
});

/**
 * Zod schema for Yjs Worker environment variables.
 */
const envSchema = z.object({
  DATABASE_URL: z.url(),

  YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
  YJS_PORT: z.coerce.number().default(Number(new URL(appConfig.yjsUrl).port) || 4002),
  YJS_DB_POOL_MAX: z.coerce.number().default(20),
  MAPLE_API_KEY: z.string().optional(),

  DEV_MODE: z.enum(['none', 'core', 'full']).default('core'),
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PINO_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  DEBUG: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Validated environment variables for Yjs Worker.
 */
export const env = envSchema.parse(process.env);
