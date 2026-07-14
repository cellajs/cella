
import type { appConfig as AppConfig } from '../../shared'
import { stateBucket } from './stack/control-store'

type Cfg = typeof AppConfig

/**
 * The one misconfiguration guard worth failing every deploy path on: an app
 * served at the zone apex. The LB module gives an apex-hosted app no DNS
 * record, cert, or host route by design (resources/loadbalancer.ts) — the
 * supported pattern is a subdomain with the automatic apex→www redirect. A
 * fork that ships `frontendUrl: https://<domain>` gets a live API and a dead
 * site, so this is checked centrally in deriveInfra (Pulumi program, CI's
 * print-deploy-env, and the infra CLI all pass through it) and surfaced early
 * by `pnpm infra`. Returns the error message, or undefined when fine.
 */
export function frontendApexIssue(appConfig: Cfg): string | undefined {
  const hasDomain = Boolean(appConfig.domain && appConfig.domain !== 'localhost')
  if (!hasDomain || appConfig.services.frontend.enabled === false) return undefined
  const frontendHost = new URL(appConfig.services.frontend.publicUrl).hostname
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
