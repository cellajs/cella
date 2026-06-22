import { defineRuntimeSecrets } from '../lib/runtime-secrets'

/**
 * The fork-owned runtime-secrets registry — the single place a fork maps an
 * application secret to the services that receive it, and declares whether it is
 * required or optional. Mirrors `config/services.config.ts`: data only, while
 * `runtime-secrets.ts` owns the machinery (Secret Manager provisioning, the
 * per-VM manifest, and the derived lookups).
 *
 * Each VM is hydrated from a PER-SERVICE manifest, so a secret is only ever
 * written to `/opt/app/.env.runtime` on a VM whose service appears in its
 * `services` list — e.g. the cdc VM never receives `COOKIE_SECRET`. Narrowing a
 * `services` array is therefore the lever for "only share what the VM needs".
 *
 * Field meanings (hover any field for the `RuntimeSecretConfig` docs):
 *  - `secretName`  — Scaleway Secret Manager container name (kebab-case).
 *  - `envVar`      — environment variable the container consumes it as.
 *  - `required`    — whether deploy/health gating treats its absence as fatal.
 *  - `valueSource` — `'pulumi'` (cella generates/derives + writes a version) or
 *                    `'operator'` (a human supplies the value out-of-band).
 *  - `generation`  — `'random'` (Pulumi RandomPassword) or `'manual'`.
 *  - `services`    — which deployable services receive it.
 *
 * Forks pin this file (see `overrides.pinned` in `cella.config.ts`) to customize the
 * mapping without conflicting on `pnpm cella` upstream syncs. A typo (unknown
 * service, duplicate envVar/secretName, empty `services`) fails fast at load
 * time in `runtime-secrets.ts` rather than as a missing variable at runtime.
 */
export default defineRuntimeSecrets({
  databaseUrlRuntime: {
    secretName: 'database-url-runtime',
    description: 'PostgreSQL runtime_role connection string (backend API, subject to RLS)',
    envVar: 'DATABASE_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['backend', 'yjs', 'ai'],
  },
  databaseUrlAdmin: {
    secretName: 'database-url-admin',
    description: 'PostgreSQL admin_role connection string (migrations, seeds, BYPASSRLS)',
    envVar: 'DATABASE_ADMIN_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  databaseUrlCdc: {
    secretName: 'database-url-cdc',
    description: 'PostgreSQL CDC worker connection string (admin_role with replication access)',
    envVar: 'DATABASE_CDC_URL',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['cdc'],
  },
  databaseSslCa: {
    secretName: 'database-ssl-ca',
    description:
      'base64-encoded PEM CA cert of the Scaleway RDB instance, used by services to verify the PostgreSQL TLS connection (derived by pulumi from the database instance; base64 keeps the multi-line PEM deliverable through the line-based .env.runtime)',
    envVar: 'DATABASE_SSL_CA',
    required: true,
    valueSource: 'pulumi',
    generation: 'manual',
    services: ['backend', 'yjs', 'ai', 'cdc'],
  },
  cookieSecret: {
    secretName: 'cookie-secret',
    description: 'Cookie signing secret',
    envVar: 'COOKIE_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  unsubscribeSecret: {
    secretName: 'unsubscribe-token-secret',
    description: 'Email unsubscribe token secret',
    envVar: 'UNSUBSCRIBE_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  cdcSecret: {
    secretName: 'cdc-secret',
    description: 'CDC authentication secret',
    envVar: 'CDC_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'cdc', 'ai'],
  },
  yjsSecret: {
    secretName: 'yjs-secret',
    description: 'Yjs WebSocket authentication secret',
    envVar: 'YJS_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'yjs', 'ai'],
  },
  piiHashSecret: {
    secretName: 'pii-hash-secret',
    description: 'HMAC pepper for hashing PII-derived identifiers',
    envVar: 'PII_HASH_SECRET',
    required: true,
    valueSource: 'pulumi',
    generation: 'random',
    services: ['backend', 'ai'],
  },
  adminEmail: {
    secretName: 'admin-email',
    description: 'Primary administrative contact email',
    envVar: 'ADMIN_EMAIL',
    required: true,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  brevoApiKey: {
    secretName: 'brevo-api-key',
    description: 'Brevo transactional email API key',
    envVar: 'BREVO_API_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  scwAiApiKey: {
    secretName: 'scw-ai-api-key',
    description: 'Scaleway AI API key for the AI worker',
    envVar: 'SCW_AI_API_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  mapleSecretIngestKey: {
    secretName: 'maple-secret-ingest-key',
    description: 'Maple.dev observability secret ingest key (server-side traces, metrics, logs)',
    envVar: 'MAPLE_SECRET_INGEST_KEY',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'cdc', 'yjs'],
  },
  githubClientId: {
    secretName: 'github-client-id',
    description: 'GitHub OAuth client ID',
    envVar: 'GITHUB_CLIENT_ID',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
  githubClientSecret: {
    secretName: 'github-client-secret',
    description: 'GitHub OAuth client secret',
    envVar: 'GITHUB_CLIENT_SECRET',
    required: false,
    valueSource: 'operator',
    generation: 'manual',
    services: ['backend', 'ai'],
  },
})
