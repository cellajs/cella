import { config as defaultConfig } from '../../config/config.default.ts';
import { development } from '../../config/config.development.ts';
import { production } from '../../config/config.production.ts';
import { staging } from '../../config/config.staging.ts';
import { test } from '../../config/config.test.ts';
import { tunnel } from '../../config/config.tunnel.ts';
import { resolveDevPortOffset, shiftLocalPort } from './dev-port-offset.ts';
import { authPath, servicePaths } from './service-paths.ts';
import type { AppServiceConfig, ConfigMode, DeepPartial, FederationConfig, S3Config, WidenScalars } from './types.ts';
import { mergeDeep, typedEntries } from './utils.ts';

/** The default config as readers see it: a literal `true` or `1` of the file is its base type here. */
type BaseConfig = WidenScalars<typeof defaultConfig>;
/** Services whose public URL the builder derives from the origin. */
type UrlBearingService = 'frontend' | 'backend' | 'yjs' | 'mcp' | 'oauth';
type BuiltServices = BaseConfig['services'] & Record<UrlBearingService, { publicUrl: string }>;
type Config = Omit<BaseConfig, 's3' | 'services'> & {
  s3: S3Config;
  services: BuiltServices;
  mode: ConfigMode;
  /** Development, tunnel and test: a stack on this machine, whose ports `devAppIndex` and the dev port offset move. */
  isLocal: boolean;
  /** Production and staging: a stack behind the load balancer, listening on every interface. */
  isDeployed: boolean;
  /** The default config's slug, the same in every mode: what the app has one of, such as its database containers. */
  appSlug: string;
  devPortOffset: number;
  frontendUrl: string;
  backendUrl: string;
  backendAuthUrl: string;
  yjsUrl: string;
  mcpUrl: string;
  oauthUrl: string;
};
const configModes = { development, tunnel, staging, production, test } satisfies Record<ConfigMode, DeepPartial<typeof defaultConfig>>;

/**
 * The env variable that overrides the origin, for a build or a container whose public address the config does not name.
 * `frontend/vite.config.ts` hands it to the browser bundle, which evaluates this file again.
 */
export const originEnvName = 'APP_ORIGIN';

// APP_MODE names the config; NODE_ENV stands in where it is unset, so a test run or a production container needs no second variable.
const rawMode = process.env.APP_MODE || process.env.NODE_ENV || 'development';
// Fail loud: an undefined `configModes` entry would otherwise boot the default configuration
// for the wrong environment with no error.
if (!Object.hasOwn(configModes, rawMode)) {
  throw new Error(`Invalid config mode "${rawMode}": must be one of ${Object.keys(configModes).join(', ')} (set APP_MODE or NODE_ENV).`);
}
const mode = rawMode as ConfigMode;

// MCP takes access tokens only, and the app's authorization server (`services.oauth`) issues them. Checked for every
// mode, so a combination only production has fails in development and in CI too.
for (const [name, overrides] of typedEntries(configModes)) {
  const { mcp, oauth } = mergeDeep(structuredClone(defaultConfig), overrides).services;
  if (mcp.enabled && !oauth.enabled) {
    throw new Error(
      `Invalid config: services.mcp is enabled in ${name} mode while services.oauth is off. MCP calls carry an access token ` +
        'that only the authorization server issues: enable services.oauth in that mode, or turn services.mcp off.',
    );
  }
}

// The type comes from the default config so literal types survive for Drizzle v1 strict enum typing.
const merged: BaseConfig = mergeDeep(structuredClone(defaultConfig), configModes[mode]);

const isDeployed = mode === 'production' || mode === 'staging';
const isLocal = !isDeployed;

// A federation's sandbox is where every mode but production signs in: its production issuer never sees a test account.
if (mode !== 'production') {
  const federations: Record<string, FederationConfig> = merged.federations;
  for (const federation of Object.values(federations)) {
    if (!federation.sandbox) continue;
    federation.issuer = federation.sandbox.issuer;
    federation.idpMetadataUrl = federation.sandbox.idpMetadataUrl;
  }
}

/** The services by slug, as the builder moves their ports. */
const serviceEntries = (): [string, AppServiceConfig][] => Object.entries(merged.services);

/** Moves every service port, the frontend's by `frontendBy` and the others by `othersBy`. */
const shiftServicePorts = (frontendBy: number, othersBy: number) => {
  for (const [slug, service] of serviceEntries()) {
    const by = slug === 'frontend' ? frontendBy : othersBy;
    service.port += by;
    if (service.internalPort !== undefined) service.internalPort += by;
  }
};

// A second app runs its stack beside the first. A person switches apps by the frontend port's last digit, and the
// services keep ten ports each, so the seven of one app never reach the next.
if (isLocal) {
  const index = merged.devAppIndex;
  if (!Number.isInteger(index) || index < 0 || index > 9)
    throw new Error(`Invalid config devAppIndex "${index}": must be a whole number from 0 to 9.`);
  shiftServicePorts(index, index * 10);
  merged.origin = shiftLocalPort(merged.origin, index);
}

// A second checkout of the app runs its stack beside the first: the service ports and the localhost origin move
// together by one offset. The env origin override below is taken as given.
const devPortOffset = mode === 'development' || mode === 'tunnel' ? resolveDevPortOffset() : 0;
const configuredHost = new URL(merged.origin).host;
if (devPortOffset) {
  shiftServicePorts(devPortOffset, devPortOffset);
  merged.origin = shiftLocalPort(merged.origin, devPortOffset);
}
const shiftedHost = new URL(merged.origin).host;

// The Fetch standard's bad ports in reach of these blocks: browsers and Node's fetch refuse them, and the Yjs relay dials `internal` with fetch.
const refusedPorts: number[] = [4045, 4190];
if (isLocal) {
  for (const [slug, service] of serviceEntries()) {
    for (const port of [service.port, service.internalPort]) {
      if (port !== undefined && refusedPorts.includes(port))
        throw new Error(`Dev port ${port} of ${slug} is one fetch refuses: pick another devAppIndex or DEV_PORT_OFFSET.`);
    }
  }
}

/** `text` with this checkout's shifted localhost origin back on the configured port, so a generated file reads the same in every checkout. */
export const withConfiguredDevPorts = (text: string): string =>
  shiftedHost === configuredHost ? text : text.replaceAll(shiftedHost, configuredHost);

// A deploy or a preview that serves the app elsewhere than the config names hands the origin in.
if (process.env[originEnvName]) merged.origin = process.env[originEnvName];

// Every service URL is a path under the origin (`servicePaths`); the Yjs relay's over the matching WebSocket scheme.
const { origin } = merged;
const frontendUrl = origin;
const backendUrl = `${origin}${servicePaths.backend}`;
const backendAuthUrl = `${origin}${authPath}`;
const yjsUrl = `${origin.replace(/^http/, 'ws')}${servicePaths.yjs}`;
const mcpUrl = `${origin}${servicePaths.mcp}`;
const oauthUrl = `${origin}${servicePaths.oauth}`;

// `services.<slug>.publicUrl` is derived, never authored, so infra consumers read one map of flags, ports and URLs.
const services: BuiltServices = {
  ...merged.services,
  frontend: { ...merged.services.frontend, publicUrl: frontendUrl },
  backend: { ...merged.services.backend, publicUrl: backendUrl },
  yjs: { ...merged.services.yjs, publicUrl: yjsUrl },
  mcp: { ...merged.services.mcp, publicUrl: mcpUrl },
  oauth: { ...merged.services.oauth, publicUrl: oauthUrl },
};

// Scaleway needs a URL-safe slug of at least four non-hyphen characters, and the slug namespaces every resource
// name, the VM's config dir and shell markers, so it starts with a letter. Apps must supply a valid value; this check
// never rewrites it.
const slugPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
for (const slug of [merged.slug, defaultConfig.slug]) {
  if (!slugPattern.test(slug)) {
    throw new Error(`Invalid config slug "${slug}": must be lowercase alphanumeric, hyphen-separated and start with a letter (e.g. "my-app").`);
  }
  if (slug.replace(/-/g, '').length < 4) {
    throw new Error(`Invalid config slug "${slug}": must be at least 4 characters (excluding hyphens) for Scaleway registry naming.`);
  }
}

// A device away for the activity window starts over, so it never needs a tombstone older than that; the margin absorbs
// clock differences and the CDC worker's lag before a tombstone it has not read goes.
if (merged.retention.deletedItemsDays < merged.retention.activityDays + 30) {
  throw new Error('[Config] retention.deletedItemsDays must be at least retention.activityDays + 30.');
}

// Bucket names and CDN URLs derive from the slug. Explicit bucket config shares storage
// across applications.
const s3 = merged.s3 as S3Config;
s3.publicBucket ??= `${merged.slug}-public`;
s3.privateBucket ??= `${merged.slug}-private`;
s3.publicCDNUrl ??= `https://${s3.publicBucket}.${s3.host}`;
s3.privateCDNUrl ??= `https://${s3.privateBucket}.${s3.host}`;

/**
 * The runtime config: the default config, then the mode config `APP_MODE` (or `NODE_ENV`) names, the app's number and
 * the dev port offset on the ports and the origin, the env origin override, with every service URL, the S3 bucket names
 * and the CDN URLs derived.
 */
export const appConfig = {
  ...merged,
  mode,
  isLocal,
  isDeployed,
  appSlug: defaultConfig.slug,
  frontendUrl,
  backendUrl,
  backendAuthUrl,
  yjsUrl,
  mcpUrl,
  oauthUrl,
  services,
  devPortOffset,
} as Config;
