import { existsSync } from 'node:fs';
import process from 'node:process';
import { createEnv } from '@t3-oss/env-core';
import { appConfig } from 'shared';
import { z } from 'zod';
import { type ModeSecret, missingModeSecrets, processModes } from '#/env-mode-secrets';
import { severityLevels } from '#/schemas/api-error-schemas';

// Resolved from this file (src/ or the dist/ bundle), so it works regardless of cwd (e.g. vitest workers).
// Variables already in the environment win over the file.
const envFile = new URL('../.env', import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const env = createEnv({
  server: {
    NODB: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    DEBUG: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    DATABASE_URL: z.url(),
    // Admin credential (table owner, BYPASSRLS): only the migrate, seed, maintenance and mcp paths need it; the request-serving API boots without it.
    DATABASE_ADMIN_URL: z.url().optional(),
    DATABASE_POOL_MAX: z.coerce.number().default(80),
    // PEM CA cert for the managed PostgreSQL TLS connection: required in production, where the DB client fails fast without it.
    DATABASE_SSL_CA: z.string().optional(),
    NODE_ENV: z.union([
      z.literal('development'),
      z.literal('production'),
      z.literal('staging'),
      z.literal('tunnel'),
      z.literal('test'),
    ]),
    PORT: z.string().default(String(appConfig.devPorts.api)),
    // The internal listener (lib/listeners.ts): the CDC socket and the Yjs relay's routes, reached only from the private network.
    INTERNAL_PORT: z.string().default(String(appConfig.devPorts.internal)),
    // Mode-bound secrets (env-mode-secrets.ts): each is required below only in the modes that read it.
    UNSUBSCRIBE_SECRET: z.string().optional(),

    // Web Push (has.push): both keys present enables sending; VAPID_SUBJECT defaults to the frontend URL.
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    COOKIE_SECRET: z.string(),

    // Operator-managed runtime secret. When the secret has no version the env var is omitted and this
    // defaults to 'none' (deny), so sys-admin routes stay off until an operator sets the allowlist.
    SYSTEM_ADMIN_IP_ALLOWLIST: z
      .union([
        z.literal('none'),
        z.literal('*'),
        z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(,(\d{1,3}\.){3}\d{1,3})*$/, 'Must be comma-separated IPv4 addresses'),
      ])
      .default('none'),

    ADMIN_EMAIL: z.email().optional(),

    TUNNEL_URL: z.string().default(''),
    TUNNEL_AUTH_TOKEN: z.string().default(''),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),
    TEST_SEND_EMAILS: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),

    TRANSLOADIT_KEY: z.string().optional(),
    TRANSLOADIT_SECRET: z.string().optional(),

    S3_ACCESS_KEY_ID: z.string().default(''),
    S3_ACCESS_KEY_SECRET: z.string().default(''),

    ELEMENT_ROOM_ID: z.string().optional(),
    ELEMENT_BOT_ACCESS_TOKEN: z.string().optional(),

    MAPLE_SECRET_INGEST_KEY: z.string().optional(),

    // Key material the Ed25519 key signing Yjs editor tokens derives from; the relay holds only the public half.
    YJS_TOKEN_PRIVATE_KEY: z.string().min(32, 'YJS_TOKEN_PRIVATE_KEY must be at least 32 characters').optional(),
    // Authenticates the Yjs relay on the internal listener's materialize route; it never signs a token.
    YJS_RELAY_SECRET: z.string().min(16, 'YJS_RELAY_SECRET must be at least 16 characters').optional(),
    CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters').optional(),
    PII_HASH_SECRET: z.string().min(16, 'PII_HASH_SECRET must be at least 16 characters').optional(),
    DATA_ENCRYPTION_KEY: z.string().min(32, 'DATA_ENCRYPTION_KEY must be at least 32 characters'),

    // GeoIP (lib/geoip.ts): local MMDB paths, the object prefix they download from ('off' disables the refresh; empty
    // means the geoip/ prefix of the public bucket), and the public address development geolocates for loopback sign-ins.
    GEOIP_COUNTRY_DB_PATH: z.string().default('./geoip/dbip-country-lite.mmdb'),
    GEOIP_ASN_DB_PATH: z.string().default('./geoip/dbip-asn-lite.mmdb'),
    GEOIP_SOURCE_URL: z.string().default(''),
    GEOIP_DEV_SAMPLE_IP: z.string().default('8.8.8.8'),

    SCW_AI_API_KEY: z.string().optional(),

    MODE: z.enum(processModes).default('api'),

    // Apply migrations and roles before binding the API port. Production runs migrations in a separate mode.
    RUN_MIGRATIONS_ON_BOOT: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),

    // Contend for the scheduled jobs (lib/job-ownership.ts: an advisory lock picks one instance). Deployed containers
    // (NODE_ENV=production) default to false and the deploy sets it on the primary rollout service; other modes run them.
    RUN_JOBS: z
      .string()
      // biome-ignore lint/style/noProcessEnv: the default depends on the NODE_ENV this same loader reads.
      .default(process.env.NODE_ENV === 'production' ? 'false' : 'true')
      .transform((v) => v === 'true'),

    PINO_LOG_LEVEL: z
      .enum([...severityLevels, 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),

    // Build-time git SHA baked into the image, reported by `/health` so a deploy can be verified against CI.
    RELEASE_SHA: z.string().default('unknown'),
  },
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // A worker VM receives only the secrets its mode reads, so a mode-bound secret is required in its own modes alone.
  createFinalSchema: (shape) =>
    z.object(shape).superRefine((values, ctx) => {
      for (const name of missingModeSecrets(values)) {
        ctx.addIssue({ code: 'custom', path: [name], message: `${name} is required when MODE=${values.MODE}` });
      }
    }),
  // Skip validation under Vitest, whose env vars come from vitest.config.ts test.env.
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  skipValidation: !!process.env.VITEST,
});

/**
 * A mode-bound secret for the code path that reads it. Throws in a process whose mode does not receive it, so nothing
 * signs, hashes or compares with a missing key.
 * @param name - The secret's env var.
 * @returns Its value.
 */
export function modeSecret(name: ModeSecret): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not configured: MODE=${env.MODE} does not receive it`);
  return value;
}
