import { existsSync } from 'node:fs';
import process from 'node:process';
import { z } from 'zod';
import { severityLevels } from '../../types.ts';
import { envFlag } from './parse-env.ts';

/** The values `NODE_ENV` takes in every service. */
export const nodeEnvs = ['development', 'production', 'test'] as const;

/** The replication slot the CDC worker reads unless `CDC_SLOT_NAME` names another. */
export const defaultCdcSlotName = 'cdc_slot';

/**
 * Loads the monorepo's one env file for a module two folders below the root: `<package>/src` or the bundle in
 * `<package>/dist`, which is why the caller passes its own `import.meta.url`. Variables already in the environment win.
 * A test process loads nothing, so a developer's keys never reach a test.
 */
export function loadRootEnv(moduleUrl: string): void {
  // biome-ignore lint/style/noProcessEnv: runs before any env module exists.
  if (process.env.VITEST) return;
  const envFile = new URL('../../.env', moduleUrl);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
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
