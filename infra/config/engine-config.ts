/** One service's endpoint entry in the app config (`services.<slug>`). */
export interface EngineServiceEndpoint {
  enabled?: boolean;
  publicUrl?: string;
}

/** The engine's input contract: everything the deploy engine reads about the app. A host injects a value satisfying it, and any new field the engine reads belongs here first. */
export interface EngineConfig {
  /** URL-safe resource prefix for every Scaleway resource and bucket. */
  slug: string;
  /** Config mode; deploys accept 'production' or 'staging'. */
  mode: string;
  /** Registered DNS zone the app deploys under ('localhost' disables deploys). */
  domain: string;
  frontendUrl: string;
  backendUrl: string;
  /** Cost escape hatch: the backend co-hosts every enabled worker in-process. */
  singleVM: boolean;
  s3: {
    region: string;
    host: string;
    publicBucket: string;
    privateBucket: string;
    publicCDNUrl: string;
    privateCDNUrl: string;
  };
  /** Service endpoint config keyed by slug (enabled flags + public URLs). */
  services: Record<string, EngineServiceEndpoint>;
}

let injected: EngineConfig | undefined;

/** Inject the config the engine deploys. Must run before importing any engine module that reads config at evaluation, so entrypoints call {@link loadEngineConfig} first and dynamic-import the rest. */
export function setEngineConfig(config: EngineConfig): void {
  injected = config;
}

/** The active engine config. Throws when no config has been loaded yet. */
export function engineConfig(): EngineConfig {
  if (!injected) {
    throw new Error(
      'engine-config: no config loaded, await loadEngineConfig() (or call setEngineConfig) before importing engine modules.',
    );
  }
  return injected;
}

/**
 * The slug namespaces every Scaleway resource name, the VM's `/etc/<slug>` config
 * dir, and the `::<slug>::` serial marker rendered into the root boot script
 * (resources/cloud-init.ts). Pinning it to kebab-case at the single config
 * boundary makes every downstream shell use of the slug safe by construction, so
 * no call site needs its own quoting or escaping.
 */
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
function assertValidSlug(slug: string): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(
      `engine-config: slug '${slug}' must be lowercase kebab-case (letters, digits, hyphens; leading letter). It namespaces VM paths and shell markers.`,
    );
  }
}

/** Structural check for configs arriving from an INFRA_CONFIG_MODULE import. */
function isEngineConfig(value: unknown): value is EngineConfig {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const strings = ['slug', 'mode', 'domain', 'frontendUrl', 'backendUrl'] as const;
  if (!strings.every((key) => typeof record[key] === 'string')) return false;
  if (typeof record.singleVM !== 'boolean') return false;
  if (typeof record.s3 !== 'object' || record.s3 === null) return false;
  if (typeof record.services !== 'object' || record.services === null) return false;
  return true;
}

/** Resolve and inject the engine config idempotently, from INFRA_CONFIG_MODULE or the workspace's shared appConfig. The shared import stays dynamic so this module can load before APP_MODE is set. */
export async function loadEngineConfig(): Promise<EngineConfig> {
  if (injected) return injected;
  const configModule = process.env.INFRA_CONFIG_MODULE;
  if (configModule) {
    const { pathToFileURL } = await import('node:url');
    const mod: Record<string, unknown> = await import(pathToFileURL(configModule).href);
    const candidate = mod.engineConfig ?? mod.default;
    if (!isEngineConfig(candidate)) {
      throw new Error(
        `engine-config: module '${configModule}' does not export an EngineConfig ('engineConfig' or default export).`,
      );
    }
    assertValidSlug(candidate.slug);
    setEngineConfig(candidate);
    return candidate;
  }
  const { appConfig } = await import('shared');
  assertValidSlug(appConfig.slug);
  setEngineConfig(appConfig);
  return appConfig;
}
