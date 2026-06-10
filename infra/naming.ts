/**
 * Pure, Pulumi-free derivations from appConfig. Touches no process.env or
 * @pulumi/pulumi, so it is safe to import from Pulumi modules, scripts, or tests.
 *
 * Holds account-global resource *names* plus derived facts (zone, tags,
 * `hasDomain`, `isProduction`). Not here: per-service public endpoints (keyed by
 * slug in `lib/services.ts`) and plain appConfig pass-throughs (in `helpers.ts`).
 */
import type { appConfig as AppConfig } from '../shared'

type Cfg = typeof AppConfig

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
      pulumiStateBucket: `${prefix}-pulumi-state`,
      // Holds `deploy/<service>.tag` objects (image SHA, plain text) that the
      // on-VM reconciler watches. Separate bucket so VM IAM can be read-only on
      // these keys without exposing Pulumi state.
      deployTagsBucket: `${prefix}-deploy-tags`,
      // Registry namespace names require >= 4 chars and no hyphens; slug length
      // is validated at config load, so only hyphens need stripping here.
      registryNamespace: appConfig.slug.replace(/-/g, ''),
    },
    // DNS zone the app's records live under (e.g. `cellajs.com`). Per-service
    // hostnames (api/yjs/ai/www) come from the service registry, not here.
    dnsZone: appConfig.domain,
    region,
    zone: `${region}-1`,
    tags: [`env=${appConfig.mode}`, `app=${appConfig.slug}`, 'managed-by=pulumi'],
    isProduction: appConfig.mode === 'production',
    hasDomain: Boolean(appConfig.domain && appConfig.domain !== 'localhost'),
  }
}

/** Shape of the derivations, inferred from the implementation. */
export type InfraDerivations = ReturnType<typeof deriveInfra>
