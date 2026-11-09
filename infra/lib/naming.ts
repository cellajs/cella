import type { EngineConfig } from '../config/engine-config';
import { enabledServices } from './services';
import { stateBucket } from './stack/control-store';

type Cfg = EngineConfig;

/** Whether the config names a DNS zone to deploy under; a local mode leaves it empty. */
export const hasDomain = (appConfig: Pick<Cfg, 'domain'>): boolean => appConfig.domain !== '';

/**
 * The refusal of an app host at the zone apex: the load balancer serves the app on a record under the zone, so the CLI, `deriveInfra`
 * and the program refuse an apex host before any apply.
 */
export function apexHostIssue(host: string, zone: string): string | undefined {
  if (host !== zone) return undefined;
  return (
    `The app cannot be served at the zone apex ('${zone}'): every deploy path refuses it before any apply. ` +
    `Set origin (shared/config) to a subdomain; with 'https://www.${zone}' the apex 301-redirects to it, preserving path and query.`
  );
}

/** The origin of the zone apex the load balancer redirects to the app host, when that host is `www.<zone>`; undefined for any other host. */
export function redirectedApexOrigin(appHost: string, zone: string): string | undefined {
  return appHost === `www.${zone}` ? `https://${zone}` : undefined;
}

/** {@link apexHostIssue} for the frontend's public URL; undefined without a domain or an enabled frontend. */
export function frontendApexIssue(appConfig: Cfg): string | undefined {
  const frontend = appConfig.services.frontend;
  if (!hasDomain(appConfig) || !frontend?.publicUrl || frontend.enabled === false) return undefined;
  return apexHostIssue(new URL(frontend.publicUrl).hostname, appConfig.domain);
}

/**
 * The refusal of an enabled routed service whose URL is on another host than the default route's: the load balancer serves every route
 * on the app host under its path prefix, with one record and one certificate. Undefined without a domain.
 */
export function routedHostIssue(appConfig: Cfg): string | undefined {
  if (!hasDomain(appConfig)) return undefined;
  const urls = appConfig.services;
  const routed = enabledServices(urls).flatMap((service) => {
    const url = service.lbRoute ? urls[service.slug]?.publicUrl : undefined;
    return url ? [{ slug: service.slug, host: new URL(url).hostname, isDefault: service.lbRoute === 'default' }] : [];
  });
  const appHost = routed.find((service) => service.isDefault)?.host;
  const elsewhere = routed.filter((service) => service.host !== appHost).map((service) => service.slug);
  if (!appHost || elsewhere.length === 0) return undefined;
  return (
    `${elsewhere.join(', ')} ${elsewhere.length === 1 ? 'has its' : 'have their'} URL off the app host '${appHost}': the load balancer serves every route there, ` +
    'under its path prefix. Derive the service URLs from origin (shared/config).'
  );
}

/** Pure, Pulumi-free derivations from appConfig: account-global resource names plus zone, tags, `hasDomain` and `isProduction`. Per-service endpoints live in `lib/services.ts`. */
export function deriveInfra(appConfig: Cfg) {
  const prefix = appConfig.slug;
  const region = appConfig.s3.region;

  const issue = frontendApexIssue(appConfig) ?? routedHostIssue(appConfig);
  if (issue) throw new Error(issue);

  return {
    naming: {
      slug: appConfig.slug,
      prefix,
      resource: (suffix: string) => `${prefix}-${suffix}`,
      frontendBucket: `${prefix}-frontend`,
      publicBucket: appConfig.s3.publicBucket,
      privateBucket: appConfig.s3.privateBucket,
      pulumiStateBucket: stateBucket(prefix),
      bootDiagBucket: `${prefix}-boot-diag`,
      // Registry namespace names require >= 4 chars and no hyphens; slug length is validated at config load.
      registryNamespace: appConfig.slug.replace(/-/g, ''),
      // Shared by creation and reset so both address the same database. PostgreSQL identifiers cannot contain hyphens.
      dbName: appConfig.slug.replace(/-/g, '_'),
    },
    // DNS zone the app's records live under. Per-service hostnames come from the service registry.
    dnsZone: appConfig.domain,
    region,
    zone: `${region}-1`,
    // Every zone of the region, `zone` first.
    zones: [1, 2, 3].map((index) => `${region}-${index}`),
    tags: [`env=${appConfig.mode}`, `app=${appConfig.slug}`, 'managed-by=pulumi'],
    // The same tags as a key-value map, for resources whose API takes a record.
    tagsAsMap: { env: appConfig.mode, app: appConfig.slug, 'managed-by': 'pulumi' } as Record<string, string>,
    isProduction: appConfig.mode === 'production',
    hasDomain: hasDomain(appConfig),
  };
}

/** Shape of the derivations, inferred from the implementation. */
export type InfraDerivations = ReturnType<typeof deriveInfra>;
