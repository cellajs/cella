import _default from '../../config/config.default';
import development from '../../config/config.development';
import production from '../../config/config.production';
import staging from '../../config/config.staging';
import test from '../../config/config.test';
import tunnel from '../../config/config.tunnel';
import type { S3Config } from './types';
import { mergeDeep } from './utils';

type Config = Omit<typeof _default, 's3'> & { s3: S3Config };
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

// APP_MODE allows selecting the config independently of NODE_ENV.
// This lets containers run with NODE_ENV=production (to avoid dev-only
// behaviour like pino-pretty worker threads) while still loading the
// development config for correct slug/naming.
const mode = (process.env.APP_MODE || process.env.NODE_ENV || 'development') as Config['mode'];

/**
 * Merged app configuration which combines default config with environment-specific overrides.
 * Type is preserved from _default to maintain literal types for Drizzle v1 strict enum typing.
 */
const merged = mergeDeep(structuredClone(_default), configModes[mode]);

// Allow environment variables to override URLs — enables deploying the dev
// config to Scaleway containers while keeping localhost defaults for local dev.
if (process.env.FRONTEND_URL) merged.frontendUrl = process.env.FRONTEND_URL;
if (process.env.BACKEND_URL) merged.backendUrl = process.env.BACKEND_URL;
if (process.env.BACKEND_AUTH_URL) merged.backendAuthUrl = process.env.BACKEND_AUTH_URL;
if (process.env.YJS_URL) merged.yjsUrl = process.env.YJS_URL;
if (process.env.MCP_API_URL) merged.mcpUrl = process.env.MCP_API_URL;

// Cost escape hatch: backend co-hosts every enabled service in-process. Set via
// env so `pnpm dev:single` (or a preview deploy) flips it without a config edit.
if (process.env.SINGLE_VM) merged.singleVM = process.env.SINGLE_VM === 'true';

merged.services = {
  ...merged.services,
  frontend: { ...(merged.services.frontend ?? {}), publicUrl: merged.frontendUrl },
  backend: { ...(merged.services.backend ?? {}), publicUrl: merged.backendUrl },
  yjs: { ...(merged.services.yjs ?? {}), publicUrl: merged.yjsUrl },
  mcp: { ...(merged.services.mcp ?? {}), publicUrl: merged.mcpUrl },
};

// Validate slug is a true, URL-safe slug. It feeds resource names (S3 buckets,
// Scaleway Container Registry namespace, etc). Scaleway registry namespaces
// require >= 4 chars with no hyphens, so we enforce a 4-char minimum on the
// hyphen-stripped form. This replaces the old silent `app` padding — forks
// must pick a valid slug rather than have one quietly mangled.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (!slugPattern.test(merged.slug)) {
  throw new Error(`Invalid config slug "${merged.slug}": must be lowercase alphanumeric, hyphen-separated (e.g. "my-app").`);
}
if (merged.slug.replace(/-/g, '').length < 4) {
  throw new Error(`Invalid config slug "${merged.slug}": must be at least 4 characters (excluding hyphens) for Scaleway registry naming.`);
}

// Derive S3 bucket names and CDN URLs from the slug (which already encodes the
// environment, e.g. "cella-development" -> cella-development-public/-private).
// The bucket name also doubles as the Transloadit credential name. Set explicit
// publicBucket/privateBucket in a config to override (e.g. to share dev buckets
// across multiple cella apps).
const s3 = merged.s3 as S3Config;
const bucketPrefix = merged.slug;
s3.publicBucket ??= `${bucketPrefix}-public`;
s3.privateBucket ??= `${bucketPrefix}-private`;
s3.publicCDNUrl ??= `https://${s3.publicBucket}.${s3.host}`;
s3.privateCDNUrl ??= `https://${s3.privateBucket}.${s3.host}`;

export const appConfig = merged as Config;
