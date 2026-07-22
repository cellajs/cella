import { config as _default } from '../../config/config.default';
import { development } from '../../config/config.development';
import { production } from '../../config/config.production';
import { staging } from '../../config/config.staging';
import { test } from '../../config/config.test';
import { tunnel } from '../../config/config.tunnel';
import type { S3Config } from './types';
import { mergeDeep } from './utils';

type Config = Omit<typeof _default, 's3'> & { s3: S3Config };
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

  // APP_MODE selects config independently so production-mode containers can use development naming.
const rawMode = process.env.APP_MODE || process.env.NODE_ENV || 'development';
// Fail loud on an unknown mode so an undefined `configModes` entry cannot silently boot the
// default configuration for the wrong environment.
if (!Object.hasOwn(configModes, rawMode)) {
  throw new Error(
    `Invalid config mode "${rawMode}": must be one of ${Object.keys(configModes).join(', ')} (set APP_MODE or NODE_ENV).`,
  );
}
const mode = rawMode as Config['mode'];

/**
 * Merged app configuration which combines default config with environment-specific overrides.
 * Type is preserved from _default to maintain literal types for Drizzle v1 strict enum typing.
 */
const merged = mergeDeep(structuredClone(_default), configModes[mode]);

// Allow environment variables to override URLs: enables deploying the dev
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

  // Require a URL-safe resource slug with at least four non-hyphen characters for Scaleway.
  // Forks must provide a valid value; validation never rewrites it.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (!slugPattern.test(merged.slug)) {
  throw new Error(`Invalid config slug "${merged.slug}": must be lowercase alphanumeric, hyphen-separated (e.g. "my-app").`);
}
if (merged.slug.replace(/-/g, '').length < 4) {
  throw new Error(`Invalid config slug "${merged.slug}": must be at least 4 characters (excluding hyphens) for Scaleway registry naming.`);
}

  // Derive environment-specific bucket names, CDN URLs, and Transloadit credentials from the slug.
  // Explicit bucket config can share storage across applications.
const s3 = merged.s3 as S3Config;
const bucketPrefix = merged.slug;
s3.publicBucket ??= `${bucketPrefix}-public`;
s3.privateBucket ??= `${bucketPrefix}-private`;
s3.publicCDNUrl ??= `https://${s3.publicBucket}.${s3.host}`;
s3.privateCDNUrl ??= `https://${s3.privateBucket}.${s3.host}`;

export const appConfig = merged as Config;
