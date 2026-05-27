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
    DEV_MODE: z.enum(['none', 'core', 'full']).default('core'),
    DEBUG: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    DATABASE_URL: z.url(),
    DATABASE_ADMIN_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().default(80),
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

    SYSTEM_ADMIN_IP_ALLOWLIST: z.union([
      z.literal('none'),
      z.literal('*'),
      z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(,(\d{1,3}\.){3}\d{1,3})*$/, 'Must be comma-separated IPv4 addresses'),
    ]),

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

    MAPLE_API_KEY: z.string().optional(),

    YJS_SECRET: z.string().min(16, 'YJS_SECRET must be at least 16 characters'),
    CDC_SECRET: z.string().min(16, 'CDC_SECRET must be at least 16 characters'),
    PII_HASH_SECRET: z.string().min(16, 'PII_HASH_SECRET must be at least 16 characters'),

    GEOIP_COUNTRY_DB_PATH: z.string().default('./geoip/dbip-country-lite.mmdb'),
    GEOIP_ASN_DB_PATH: z.string().default('./geoip/dbip-asn-lite.mmdb'),

    PINO_LOG_LEVEL: z
      .enum([...severityLevels, 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),
  },
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
  // Skip validation when running in Vitest (env vars set by vitest.config.ts test.env)
  // This allows vitest workspace to import tests before env vars are fully configured
  // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
  skipValidation: !!process.env.VITEST,
});
