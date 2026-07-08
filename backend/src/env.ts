import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { env as dotenv } from '@dotenv-run/core';
import { createEnv } from '@t3-oss/env-core';
import { appConfig } from 'shared';
import { z } from 'zod';
import { severityLevels } from '#/schemas/api-error-schemas';

// Resolve root relative to this file so it works regardless of cwd (e.g. vitest workers)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv({
  root: path.resolve(__dirname, '../../..'),
  files: ['.env'],
});

/**
 * Environment variables validated with zod
 */
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
    DATABASE_ADMIN_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().default(80),
    // PEM CA cert (Scaleway RDB instance) for verifying the managed PostgreSQL
    // TLS connection. Auto-provisioned by `pulumi up`; required in production
    // (the DB client fails fast if missing). Unused in local development.
    DATABASE_SSL_CA: z.string().optional(),
    NODE_ENV: z.union([
      z.literal('development'),
      z.literal('production'),
      z.literal('staging'),
      z.literal('tunnel'),
      z.literal('test'),
    ]),
    PORT: z.string().default('4000'),
    UNSUBSCRIBE_SECRET: z.string(),

    COOKIE_SECRET: z.string(),

    // Optional operator-managed runtime secret (system-admin-ip-allowlist). When
    // the secret has no version the env var is omitted, so it defaults to 'none'
    // (deny) — sys-admin routes stay off until an operator sets the allowlist.
    SYSTEM_ADMIN_IP_ALLOWLIST: z
      .union([
        z.literal('none'),
        z.literal('*'),
        z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(,(\d{1,3}\.){3}\d{1,3})*$/, 'Must be comma-separated IPv4 addresses'),
      ])
      .default('none'),

    ADMIN_EMAIL: z.email(),

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

    YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
    CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
    PII_HASH_SECRET: z.string().min(16, 'PII_HASH_SECRET must be at least 16 characters'),
    DATA_ENCRYPTION_KEY: z.string().min(32, 'DATA_ENCRYPTION_KEY must be at least 32 characters'),

    GEOIP_COUNTRY_DB_PATH: z.string().default('./geoip/dbip-country-lite.mmdb'),
    GEOIP_ASN_DB_PATH: z.string().default('./geoip/dbip-asn-lite.mmdb'),

    SCW_AI_API_KEY: z.string().optional(),

    // --- Experimental OAuth/OIDC Authorization Server (node-oidc-provider) ---
    // Off by default. When true, MODE=api mounts an in-process OIDC provider at
    // `${backendUrl}/oauth` that issues audience-bound JWT access tokens for the
    // MCP resource. See .todos/MCP_PLAN.md (Experiment 0).
    AUTH_SERVER_ENABLED: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    // RS256 private signing key as a JSON JWK string. Optional: when omitted the
    // provider generates an ephemeral dev key at boot (tokens die on restart).
    // Generate a stable one with: pnpm --filter backend exec tsx scripts/gen-oidc-jwk.ts
    OIDC_PRIVATE_JWK: z.string().optional(),
    // Secret for the pre-registered dev confidential client (client_credentials
    // smoke test). Dev-only; ignored unless AUTH_SERVER_ENABLED.
    OIDC_DEV_CLIENT_SECRET: z.string().default('dev-mcp-client-secret'),
    // Comma-separated OAuth client ids allowed to call MCP as a service actor
    // (client_credentials, no user). Each token is still audience-bound to a
    // single tenant/org. Until per-client tenant binding lands (Phase 1), this
    // allowlist is the gate that keeps arbitrary DCR clients out.
    MCP_SERVICE_CLIENT_IDS: z
      .string()
      .default('mcp-dev-client')
      .transform((v) =>
        v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      ),

    MODE: z.enum(['api', 'mcp-worker', 'cdc', 'migrate']).default('api'),

    // When true, the API server applies pending migrations + ensures DB roles
    // on boot, before binding the port. Production sets this to 'false' so the
    // serve path stays fast and migrations run as a separate one-shot
    // (MODE=migrate) before the app rolls. Defaults to 'true' so local dev and
    // tests keep their single-command boot behaviour.
    RUN_MIGRATIONS_ON_BOOT: z
      .string()
      .default('true')
      .transform((v) => v === 'true'),

    PINO_LOG_LEVEL: z
      .enum([...severityLevels, 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),

    // Build-time release identifier (git SHA from CI), baked into the image
    // as an ENV. Surfaced via `/health` so the deploy verifier can confirm
    // the running container matches the SHA CI just pushed.
    RELEASE_SHA: z.string().default('unknown'),
  },
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Skip validation when running in Vitest (env vars set by vitest.config.ts test.env)
  // This allows vitest workspace to import tests before env vars are fully configured
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  skipValidation: !!process.env.VITEST,
});
