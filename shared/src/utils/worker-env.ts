import { existsSync } from 'node:fs';
import process from 'node:process';
import { z } from 'zod';
import { severityLevels } from '../../types.ts';

/** The values `NODE_ENV` takes in every service. */
export const nodeEnvs = ['development', 'production', 'test'] as const;

/** The one env file for the monorepo, `backend/.env`, resolved from this file. Variables already in the environment win. */
export function loadBackendDotenv(): void {
  const envFile = new URL('../../../backend/.env', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
}

/** A flag that only the string `true` turns on; unset, it reads as `fallback`. */
export function envFlag(fallback: 'true' | 'false') {
  return z
    .string()
    .default(fallback)
    .transform((value) => value === 'true');
}

/** Shared by cdc and yjs. Extend with service-specific fields. */
export const workerEnvBase = z.object({
  // PEM CA cert for the Scaleway RDB instance, verifying the PostgreSQL TLS connection.
  // Provisioned by `pulumi up` and required in production.
  DATABASE_SSL_CA: z.string().optional(),
  MAPLE_SECRET_INGEST_KEY: z.string().optional(),
  // The standard OTLP destination; it wins over the Maple key. The OTel exporters read it and its sibling variables
  // (OTEL_EXPORTER_OTLP_HEADERS, per-signal endpoints) from the environment themselves.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  // Build-time git SHA baked into the image, reported by `/health` and as `service.version` in telemetry.
  RELEASE_SHA: z.string().default('unknown'),

  NODE_ENV: z.enum(nodeEnvs).default('development'),
  PINO_LOG_LEVEL: z.enum([...severityLevels, 'silent']).optional(),
  DEBUG: envFlag('false'),
});
