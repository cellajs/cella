import { config as _default } from '../../config/config.default.ts';
import { development } from '../../config/config.development.ts';
import { production } from '../../config/config.production.ts';
import { staging } from '../../config/config.staging.ts';
import { test } from '../../config/config.test.ts';
import { tunnel } from '../../config/config.tunnel.ts';
import { resolveDevPortOffset, shiftLocalPort } from './dev-port-offset.ts';
import type { S3Config } from './types.ts';
import { mergeDeep, typedEntries } from './utils.ts';

/** Services whose public URL the builder derives from the top-level URL family. */
type UrlBearingService = 'frontend' | 'backend' | 'yjs' | 'mcp' | 'oauth';
type BuiltServices = typeof _default.services & Record<UrlBearingService, { publicUrl: string }>;
type Config = Omit<typeof _default, 's3' | 'services'> & { s3: S3Config; services: BuiltServices; devPortOffset: number };
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

/**
 * The public URL family and the env variable that overrides each URL. The dev port offset shifts the same URLs, and
 * `frontend/vite.config.ts` hands the same variables to the browser bundle, which evaluates this file again.
 */
export const urlEnvNames = {
  frontendUrl: 'FRONTEND_URL',
  backendUrl: 'BACKEND_URL',
  backendAuthUrl: 'BACKEND_AUTH_URL',
  yjsUrl: 'YJS_URL',
  mcpUrl: 'MCP_URL',
  oauthUrl: 'OAUTH_URL',
} as const;

// APP_MODE selects config independently so production-mode containers can use development naming.
const rawMode = process.env.APP_MODE || process.env.NODE_ENV || 'development';
// Fail loud: an undefined `configModes` entry would otherwise boot the default configuration
// for the wrong environment with no error.
if (!Object.hasOwn(configModes, rawMode)) {
  throw new Error(`Invalid config mode "${rawMode}": must be one of ${Object.keys(configModes).join(', ')} (set APP_MODE or NODE_ENV).`);
}
const mode = rawMode as Config['mode'];

// MCP takes access tokens only, and the app's authorization server (`services.oauth`) issues them. Checked for every
// mode, so a combination only production has fails in development and in CI too.
for (const [name, overrides] of typedEntries(configModes)) {
  const { mcp, oauth } = mergeDeep(structuredClone(_default), overrides).services;
  if (mcp.enabled && !oauth.enabled) {
    throw new Error(
      `Invalid config: services.mcp is enabled in ${name} mode while services.oauth is off. MCP calls carry an access token ` +
        'that only the authorization server issues: enable services.oauth in that mode, or turn services.mcp off.',
    );
  }
}

// The type comes from _default so literal types survive for Drizzle v1 strict enum typing.
const merged = mergeDeep(structuredClone(_default), configModes[mode]);

// A second checkout of the app runs its stack beside the first: `devPorts` and the localhost URL
// family move together by one offset. The env URL overrides below are taken as given.
const devPortOffset = mode === 'development' || mode === 'tunnel' ? resolveDevPortOffset() : 0;
/** Shifted `host:port` to the configured one, for each URL the offset moved. */
const shiftedHosts = new Map<string, string>();
if (devPortOffset) {
  for (const [service, port] of typedEntries(merged.devPorts)) merged.devPorts[service] = port + devPortOffset;
  for (const [key] of typedEntries(urlEnvNames)) {
    const shifted = shiftLocalPort(merged[key], devPortOffset);
    if (shifted !== merged[key]) shiftedHosts.set(new URL(shifted).host, new URL(merged[key]).host);
    merged[key] = shifted;
  }
}

/** `text` with this checkout's shifted localhost URLs back on the configured ports, so a generated file reads the same in every checkout. */
export const withConfiguredDevPorts = (text: string): string =>
  [...shiftedHosts].reduce((result, [shifted, configured]) => result.replaceAll(shifted, configured), text);

// URL overrides let the dev config deploy to Scaleway containers while local dev keeps localhost.
for (const [key, envName] of typedEntries(urlEnvNames)) {
  const url = process.env[envName];
  if (url) merged[key] = url;
}

// Set via env so `pnpm dev:single` or a preview deploy flips it without a config edit.
if (process.env.SINGLE_VM) merged.singleVM = process.env.SINGLE_VM === 'true';

// `services.<slug>.publicUrl` is derived, never authored: the URL family above (after env
// overrides) is the single source, so infra consumers read one map of flags plus URLs.
const services: BuiltServices = {
  ...merged.services,
  frontend: { ...merged.services.frontend, publicUrl: merged.frontendUrl },
  backend: { ...merged.services.backend, publicUrl: merged.backendUrl },
  yjs: { ...merged.services.yjs, publicUrl: merged.yjsUrl },
  mcp: { ...merged.services.mcp, publicUrl: merged.mcpUrl },
  oauth: { ...merged.services.oauth, publicUrl: merged.oauthUrl },
};

// Scaleway needs a URL-safe slug of at least four non-hyphen characters. Apps must supply a
// valid value; this check never rewrites it.
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (!slugPattern.test(merged.slug)) {
  throw new Error(`Invalid config slug "${merged.slug}": must be lowercase alphanumeric, hyphen-separated (e.g. "my-app").`);
}
if (merged.slug.replace(/-/g, '').length < 4) {
  throw new Error(`Invalid config slug "${merged.slug}": must be at least 4 characters (excluding hyphens) for Scaleway registry naming.`);
}

// A device away for the activity window starts over, so it never needs a tombstone older than that; the margin absorbs
// clock differences and the CDC worker's lag before a tombstone it has not read goes.
if (merged.retention.deletedItemsDays < merged.retention.activityDays + 30) {
  throw new Error('[Config] retention.deletedItemsDays must be at least retention.activityDays + 30.');
}

// Bucket names and CDN URLs derive from the slug. Explicit bucket config shares storage
// across applications.
const s3 = merged.s3 as S3Config;
const bucketPrefix = merged.slug;
s3.publicBucket ??= `${bucketPrefix}-public`;
s3.privateBucket ??= `${bucketPrefix}-private`;
s3.publicCDNUrl ??= `https://${s3.publicBucket}.${s3.host}`;
s3.privateCDNUrl ??= `https://${s3.privateBucket}.${s3.host}`;

export const appConfig = { ...merged, services, devPortOffset } as Config;
