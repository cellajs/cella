import { env as dotenv } from '@dotenv-run/core';
import { z } from 'zod';

/**
 * Load the backend's .env: the single env file shared across the monorepo.
 * The relative root resolves from the worker's own CWD (cdc/ or yjs/).
 */
export function loadBackendDotenv(): void {
  dotenv({
    root: '../backend',
    files: ['.env'],
  });
}

/** Env vars every worker (cdc, yjs) shares. Extend with service-specific fields. */
export const workerEnvBase = z.object({
  // PEM CA cert (Scaleway RDB instance) to verify the PostgreSQL TLS connection.
  // Auto-provisioned by `pulumi up`; required in production.
  DATABASE_SSL_CA: z.string().optional(),
  MAPLE_SECRET_INGEST_KEY: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PINO_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  DEBUG: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});
