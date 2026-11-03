import { appConfig } from 'shared';
import { config as defaults } from 'shared/config/config.default';

/** One service's endpoint entry in the app config (`services.<slug>`). */
export interface EngineServiceEndpoint {
  enabled?: boolean;
  publicUrl?: string;
}

/** The engine's input contract: everything the deploy engine reads about the app. Any new field the engine reads belongs here first, and in the applied description (lib/deploy/app-description.ts). */
export interface EngineConfig {
  /** URL-safe resource prefix for every Scaleway resource and bucket. */
  slug: string;
  /** The app's own slug, the same in every environment: it names what the app has one of, the operator and the observer. */
  appSlug: string;
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
  /** Contact-map style URLs per color mode; the frontend CSP allows their origins. */
  mapStyleUrls?: Record<string, string>;
}

/**
 * The slug namespaces every Scaleway resource name, a machine's `/etc/<slug>` config
 * dir, and the `::<slug>::` serial marker of its first-boot script
 * (lib/deploy/machine-user-data.ts). Pinning it to kebab-case at the single config
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

/**
 * The config the engine deploys: the workspace's appConfig for the mode `APP_MODE` names, read once, when this module first loads.
 * So only the Pulumi program imports it statically, behind `pulumi-context.ts`'s check of the mode against the stack; every other
 * module takes the config as a parameter or imports this one dynamically after its entrypoint set `APP_MODE`, and
 * `loadStackContext` and the deploy refuse a config whose mode differs from the one they asked for. The app's slug is production's:
 * the default config's, which production keeps and other modes override.
 */
export const engineConfig: EngineConfig = { ...appConfig, appSlug: defaults.slug };
assertValidSlug(engineConfig.slug);
assertValidSlug(engineConfig.appSlug);
