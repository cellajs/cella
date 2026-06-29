import { env as dotenv } from '@dotenv-run/core';
import { appConfig } from 'shared';
import { z } from 'zod';

// Load .env from backend directory (same .env file, shared across monorepo)
dotenv({
  root: '../backend',
  files: ['.env'],
});

/**
 * Zod schema for CDC Worker environment variables.
 */
const envSchema = z.object({
  DATABASE_CDC_URL: z.url(),
  // PEM CA cert (Scaleway RDB instance) to verify the PostgreSQL TLS connection.
  // Auto-provisioned by `pulumi up`; required in production.
  DATABASE_SSL_CA: z.string().optional(),

  API_WS_URL: z.url().default(`ws://localhost:${new URL(appConfig.backendUrl).port}/internal/cdc`),
  CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
  CDC_HEALTH_PORT: z.coerce.number().default(4001),
  MAPLE_SECRET_INGEST_KEY: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PINO_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  DEBUG: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

/**
 * Validated environment variables for CDC Worker.
 */
export const env = envSchema.parse(process.env);
