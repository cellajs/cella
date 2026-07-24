
import type { EngineConfig } from '../config/engine-config'
import { stateBucket } from './stack/control-store'

type Cfg = EngineConfig

/**
 * Reports unsupported frontend deployment at the zone apex, where no app DNS, certificate,
 * or host route is created. Deploy paths validate this centrally and require a subdomain.
 */
export function frontendApexIssue(appConfig: Cfg): string | undefined {
  const hasDomain = Boolean(appConfig.domain && appConfig.domain !== 'localhost')
  const frontend = appConfig.services.frontend
  if (!hasDomain || !frontend?.publicUrl || frontend.enabled === false) return undefined
  const frontendHost = new URL(frontend.publicUrl).hostname
  if (frontendHost !== appConfig.domain) return undefined
  return (
    `The app cannot be served at the zone apex ('${appConfig.domain}') — the load balancer gives an apex-hosted app no DNS record, TLS certificate, or host route. ` +
    `Set frontendUrl (shared/config) to a subdomain, e.g. 'https://www.${appConfig.domain}'; the apex then 301-redirects to it automatically, preserving path and query.`
  )
}

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

  const apexIssue = frontendApexIssue(appConfig)
  if (apexIssue) throw new Error(apexIssue)

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
      // Shared by creation and reset so both address the same logical database.
      // PostgreSQL identifiers cannot contain hyphens.
      dbName: appConfig.slug.replace(/-/g, '_'),
    },
    // DNS zone the app's records live under (e.g. `cellajs.com`). Per-service
    // hostnames (api/yjs/mcp/www) come from the service registry, not here.
    dnsZone: appConfig.domain,
    region,
    zone: `${region}-1`,
    tags: [`env=${appConfig.mode}`, `app=${appConfig.slug}`, 'managed-by=pulumi'],
    // The same tags as a key→value map, for resources (Object Storage buckets)
    // whose API takes a record.
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
