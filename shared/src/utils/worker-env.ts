import { env as dotenv } from '@dotenv-run/core';
import { z } from 'zod';

/** The one env file for the monorepo. The relative root resolves from the worker's own CWD. */
export function loadBackendDotenv(): void {
  dotenv({
    root: '../backend',
    files: ['.env'],
  });
}

/** Shared by cdc and yjs. Extend with service-specific fields. */
export const workerEnvBase = z.object({
  // PEM CA cert for the Scaleway RDB instance, verifying the PostgreSQL TLS connection.
  // Provisioned by `pulumi up` and required in production.
  DATABASE_SSL_CA: z.string().optional(),
  MAPLE_SECRET_INGEST_KEY: z.string().optional(),

  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PINO_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  DEBUG: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});
