import { existsSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv as parseDotenv } from 'node:util';
import { appConfig, severityLevels } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { envFlag, parseEnv } from 'shared/utils/parse-env';
import { defaultCdcSlotName, loadRootEnv, nodeEnvs } from 'shared/utils/worker-env';
import { z } from 'zod';
import { missingServiceSecrets, processServices, type ServiceSecret } from '#/env-service-secrets';

loadRootEnv(import.meta.url);
const exampleEnvFile = new URL('../../.env.example', import.meta.url);

/** Minimum length of a secret that signs or authenticates; the CDC and Yjs workers hold their copies to the same. */
const minSecretLength = 16;

/**
 * Every secret the schema validates: each `secretString`, the cookie secret, and the relay's public key, which the
 * backend never parses but the `.env` it shares hands to a relay started beside it.
 */
const secretNames = new Set(['COOKIE_SECRET', 'YJS_TOKEN_PUBLIC_KEY']);

const secretString = (name: string, min = minSecretLength) => {
  secretNames.add(name);
  return z.string().min(min, `${name} must be at least ${min} characters`);
};

/** A local stack's database URLs default to the compose containers; a deployed one receives them as runtime secrets. */
const localDatabase = (role: Parameters<typeof localDatabaseUrl>[1]) =>
  appConfig.isLocal ? z.url().default(localDatabaseUrl('dev', role)) : z.url();

/**
 * The secrets that still equal their value in `.env.example`, which ships in the repo. Tunnel mode alone reads it: a
 * tunnel serves this API on the developer's database to the internet, where that value lets anyone sign cookies,
 * unsubscribe links and relay tokens.
 * @returns The offending names; empty outside tunnel mode or without the example file.
 */
const publishedSecrets = (): string[] => {
  if (appConfig.mode !== 'tunnel' || !existsSync(exampleEnvFile)) return [];
  const example = parseDotenv(readFileSync(exampleEnvFile, 'utf8'));
  return [...secretNames].filter((name) => {
    const published = example[name];
    // A cookie secret list verifies with every entry, so one published entry forges as well as the first.
    // biome-ignore lint/style/noProcessEnv: this file IS the env loader.
    return !!published && !!process.env[name]?.split(',').some((entry) => entry.trim() === published);
  });
};

/**
 * Per federation in `appConfig.federations`, the client id and secret it was registered with: `SSO_<KEY>_CLIENT_ID`
 * and `SSO_<KEY>_CLIENT_SECRET`, optional because a federation is live only once both are set.
 */
const federationSecrets = Object.fromEntries(
  Object.keys(appConfig.federations).flatMap((key) => {
    const prefix = `SSO_${key.toUpperCase()}`;
    return [
      [`${prefix}_CLIENT_ID`, z.string().optional()],
      [`${prefix}_CLIENT_SECRET`, z.string().optional()],
    ];
  }),
) as Record<string, z.ZodOptional<z.ZodString>>;

/** The backend's validated environment: a process whose env fails the schema stops at import. */
const envSchema = z
  .object({
    NODB: envFlag('false'),
    DEBUG: envFlag('false'),
    DATABASE_URL: localDatabase('runtime_role'),
    // Admin credential (table owner, BYPASSRLS): only the migrate, seed and maintenance paths need it; the request-serving API boots without it.
    DATABASE_ADMIN_URL: appConfig.isLocal ? localDatabase('postgres') : z.url().optional(),
    // admin_role's password when the roles are created; unset, it takes the runtime role's from DATABASE_URL.
    DATABASE_ADMIN_ROLE_PASSWORD: z.string().optional(),
    // Capped for the managed instance's connection budget: max_connections is 100 (the engine default, 3 slots
    // superuser-reserved), and the API, cdc, yjs, the job store and the migrate companion add up to about half of it.
    DATABASE_POOL_MAX: z.coerce.number().default(20),
    // PEM CA cert for the managed PostgreSQL TLS connection: required in production, where the DB client fails fast without it.
    DATABASE_SSL_CA: z.string().optional(),
    // The database pg_cron runs in, where migrations schedule the retention job: needed where the admin role is no superuser and so may not read `cron.database_name`.
    PG_CRON_DATABASE: z.string().optional(),
    // The build Node runs: a development or test stack, or a production build; `APP_MODE` names the config.
    NODE_ENV: z.enum(nodeEnvs).default('development'),
    UNSUBSCRIBE_SECRET: secretString('UNSUBSCRIBE_SECRET').optional(),

    // Web Push (has.push): both keys present enables sending. VAPID_SUBJECT must be a `mailto:` or `https:` URL; unset, it
    // falls back to the frontend URL, which web-push refuses in development (http://localhost), so push stays off there.
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().optional(),

    // One secret or a comma-separated list (the first signs, any verifies). Every entry counts on its own, so a stray
    // comma or a short entry stops the boot and never becomes a signing key.
    COOKIE_SECRET: z.string().refine((value) => value.split(',').every((entry) => entry.trim().length >= minSecretLength), {
      message: `Every COOKIE_SECRET entry must be at least ${minSecretLength} characters`,
    }),

    // Operator-managed runtime secret. When the secret has no version the env var is omitted and this
    // defaults to 'off' (deny), so sys-admin routes stay off until an operator sets the allowlist.
    SYSTEM_ADMIN_IP_ALLOWLIST: z
      .union([
        z.literal('off'),
        z.literal('*'),
        z.string().regex(/^(\d{1,3}\.){3}\d{1,3}(,(\d{1,3}\.){3}\d{1,3})*$/, 'Must be comma-separated IPv4 addresses'),
      ])
      .default('off'),

    ADMIN_EMAIL: z.email().optional(),

    TUNNEL_AUTH_TOKEN: z.string().optional(),

    SEND_ALL_TO_EMAIL: z.string().optional(),
    BREVO_API_KEY: z.string().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    ...federationSecrets,

    TRANSLOADIT_KEY: z.string().optional(),
    TRANSLOADIT_SECRET: z.string().optional(),

    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_ACCESS_KEY_SECRET: z.string().optional(),

    MAPLE_SECRET_INGEST_KEY: z.string().optional(),
    // The standard OTLP destination; it wins over the Maple key. The OTel exporters read it and its sibling variables
    // (OTEL_EXPORTER_OTLP_HEADERS, per-signal endpoints) from the environment themselves.
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),

    // Key material the Ed25519 key signing Yjs editor tokens derives from; the relay holds only the public half.
    YJS_TOKEN_PRIVATE_KEY: secretString('YJS_TOKEN_PRIVATE_KEY', 32).optional(),
    // Authenticates the Yjs relay on the internal listener's materialize route; it never signs a token.
    YJS_RELAY_SECRET: secretString('YJS_RELAY_SECRET').optional(),
    CDC_SECRET: secretString('CDC_SECRET').optional(),
    PII_HASH_SECRET: secretString('PII_HASH_SECRET').optional(),
    DATA_ENCRYPTION_KEY: secretString('DATA_ENCRYPTION_KEY', 32),

    // GeoIP: local MMDB paths, the object prefix they download from ('off' disables the refresh; empty
    // means the geoip/ prefix of the public bucket), and the public address development geolocates for loopback sign-ins.
    GEOIP_COUNTRY_DB_PATH: z.string().default('./geoip/dbip-country-lite.mmdb'),
    GEOIP_ASN_DB_PATH: z.string().default('./geoip/dbip-asn-lite.mmdb'),
    GEOIP_SOURCE_URL: z.string().optional(),
    GEOIP_DEV_SAMPLE_IP: z.string().default('193.0.6.139'),

    SCW_AI_API_KEY: z.string().optional(),

    // The process this backend image runs as.
    SERVICE: z.enum(processServices).default('api'),

    // The slot the seed asks the CDC worker's books about; a test names a slot of its own.
    CDC_SLOT_NAME: z.string().default(defaultCdcSlotName),

    // Apply migrations and roles before binding the API port. A deployed stack runs them as a service of their own.
    RUN_MIGRATIONS_ON_BOOT: envFlag(appConfig.isLocal ? 'true' : 'false'),

    PINO_LOG_LEVEL: z
      .enum([...severityLevels, 'silent'])
      .default(appConfig.mode === 'test' ? 'silent' : appConfig.mode === 'production' ? 'info' : 'debug'),

    // Build-time git SHA baked into the image, reported by `/health` so a deploy can be verified against CI.
    RELEASE_SHA: z.string().default('unknown'),
  })
  .superRefine((values, ctx) => {
    for (const name of missingServiceSecrets(values)) {
      ctx.addIssue({ code: 'custom', path: [name], message: `${name} is required when SERVICE=${values.SERVICE}` });
    }
    for (const name of publishedSecrets()) {
      const fix =
        name === 'YJS_TOKEN_PUBLIC_KEY'
          ? 'set the key `pnpm --filter backend yjs:public-key` prints for a fresh YJS_TOKEN_PRIVATE_KEY'
          : 'set a fresh value in .env, for example from `openssl rand -hex 32`';
      const message = `${name} equals its public value in .env.example, which tunnel mode refuses: ${fix}`;
      ctx.addIssue({ code: 'custom', path: [name], message });
    }
  });

// biome-ignore lint/style/noProcessEnv: this file IS the env loader.
export const env = parseEnv(envSchema, process.env);

/**
 * A service-bound secret for the code path that reads it. Throws in a process whose service does not receive it, so
 * nothing signs, hashes or compares with a missing key.
 */
export function serviceSecret(name: ServiceSecret): string {
  const value = env[name];
  if (!value) throw new Error(`${name} is not configured: SERVICE=${env.SERVICE} does not receive it`);
  return value;
}
