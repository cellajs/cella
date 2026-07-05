
import type { appConfig as AppConfig } from '../../shared'
import { stateBucket } from './stack/control-store'

type Cfg = typeof AppConfig

/**
 * Pure, Pulumi-free derivations from appConfig.
 * 
 * Holds account-global resource *names* plus derived facts (zone, tags,
 * `hasDomain`, `isProduction`). Not here: per-service public endpoints (keyed by
 * slug in `lib/services.ts`) and plain appConfig pass-throughs (in `pulumi-context.ts`).
 */
export function deriveInfra(appConfig: Cfg) {
  const prefix = appConfig.slug
  const region = appConfig.s3.region

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
      // Registry namespace names require >= 4 chars and no hyphens; slug length
      // is validated at config load, so only hyphens need stripping here.
      registryNamespace: appConfig.slug.replace(/-/g, ''),
    },
    // DNS zone the app's records live under (e.g. `cellajs.com`). Per-service
    // hostnames (api/yjs/mcp/www) come from the service registry, not here.
    dnsZone: appConfig.domain,
    region,
    zone: `${region}-1`,
    tags: [`env=${appConfig.mode}`, `app=${appConfig.slug}`, 'managed-by=pulumi'],
    // The same tags as a key→value map, for resources (Object Storage buckets)
    // whose API takes a record instead of `key=value` strings.
    tagsAsMap: {
      env: appConfig.mode,
      app: appConfig.slug,
      'managed-by': 'pulumi',
    } as Record<string, string>,
    isProduction: appConfig.mode === 'production',
    hasDomain: Boolean(appConfig.domain && appConfig.domain !== 'localhost'),
  }
}

/** Shape of the derivations, inferred from the implementation. */
export type InfraDerivations = ReturnType<typeof deriveInfra>
