/**
 * Print deploy env values derived from shared/* config, as `key=value` lines
 * suitable for `>> $GITHUB_OUTPUT`. Avoids duplicating naming/region in CI.
 *
 * Output is constrained to an explicit allowlist so a future refactor can't
 * accidentally widen the surface area or leak a secret-shaped value into the
 * GitHub Actions log.
 *
 * Usage: tsx infra/tasks/print-deploy-env.ts <staging|production>
 */
import { isMain } from '../lib/is-main'
import type { appConfig as AppConfig } from '../../shared'
import { deriveInfra } from '../lib/naming'
import { enabledServices, serviceEndpoints } from '../lib/services'
import { getFlag } from './args'

type Cfg = typeof AppConfig

/** Exact set of keys this script is allowed to emit. Tests lock this. */
export const ALLOWED_KEYS = [
  'environment',
  'image_tag',
  'pulumi_stack',
  'region',
  'registry_ns',
  'frontend_bucket',
  'state_bucket',
  'vm_reader_app',
  'enabled_services_json',
  'build_images_matrix',
  'primary_rollout_matrix',
  'roll_rest_matrix',
] as const
export type AllowedKey = (typeof ALLOWED_KEYS)[number]

/** Pure builder — given an appConfig, produce the deploy env table. */
export function buildDeployEnv(appConfig: Cfg, opts: { imageTag?: string } = {}): Record<AllowedKey, string> {
  const { naming } = deriveInfra(appConfig)
  const enabled = enabledServices(appConfig.services)
  const serviceUrls = appConfig.services as Record<string, { publicUrl?: string }>
  const serviceUrl = (slug: string): string => serviceUrls[slug]?.publicUrl ?? ''
  const urls = new Map(serviceEndpoints(appConfig).map((endpoint) => [endpoint.slug, endpoint.url]))
  const enabledServiceRows = enabled.map((service) => ({
    service: service.slug,
    public_url: serviceUrl(service.slug),
    health_url: service.lbRoute ? (urls.get(service.slug) ?? '') : '',
    lb_route: service.lbRoute ?? '',
    dockerfile: service.dockerfile ?? '',
    reuses_image_of: service.reusesImageOf ?? '',
    primary_rollout: service.primaryRollout === true,
  }))
  const primaryServices = enabled.filter((service) => service.primaryRollout)
  if (primaryServices.length > 1) {
    throw new Error(`At most one enabled service may set primaryRollout: true (${primaryServices.map((service) => service.slug).join(', ')})`)
  }
  const primaryService = primaryServices[0]
  const primaryRollout = primaryService ? enabledServiceRows.filter((item) => item.service === primaryService.slug).map(({ service, health_url }) => ({ service, health_url })) : []
  const restRollout = (primaryService ? enabledServiceRows.filter((item) => item.service !== primaryService.slug) : enabledServiceRows).map(({ service, health_url }) => ({ service, health_url }))
  const buildImages = enabled
    .filter((service) => !service.reusesImageOf)
    .map((service) => {
      if (!service.dockerfile) throw new Error(`Service '${service.slug}' builds its own image but has no dockerfile in services.config.ts`)
      return { service: service.slug, dockerfile: service.dockerfile }
    })

  return {
    environment: appConfig.mode,
    image_tag: opts.imageTag ?? '',
    pulumi_stack: appConfig.mode,
    region: appConfig.s3.region,
    registry_ns: naming.registryNamespace,
    frontend_bucket: naming.frontendBucket,
    state_bucket: naming.pulumiStateBucket,
    // Deterministic IAM application name for the VM reader identity. CI's
    // "Verify VM reader IAM grant" step resolves the application id by this
    // name (the id is no longer stored in stack config — SOVRUN §3.3).
    vm_reader_app: `${appConfig.slug}-vm-reader`,
    enabled_services_json: JSON.stringify(enabledServiceRows),
    build_images_matrix: JSON.stringify(buildImages),
    primary_rollout_matrix: JSON.stringify(primaryRollout),
    roll_rest_matrix: JSON.stringify(restRollout),
  }
}

export async function main(): Promise<void> {
  const mode = process.argv[2]
  if (!mode) {
    console.error('Usage: print-deploy-env.ts <staging|production> [--git-ref refs/heads/main] [--git-sha <sha>]')
    process.exit(1)
  }
  const gitRef = getFlag(process.argv, '--git-ref')
  const gitSha = getFlag(process.argv, '--git-sha')
  if (mode === 'production' && gitRef && gitRef !== 'refs/heads/main') {
    console.error(`::error::Production deploys are only allowed from the main branch (got ${gitRef})`)
    process.exit(1)
  }
  process.env.APP_MODE = mode
  const { appConfig } = await import('shared')
  if (appConfig.mode !== mode) {
    console.error(`Mode mismatch: requested "${mode}" but loaded config is "${appConfig.mode}"`)
    process.exit(1)
  }
  for (const [k, v] of Object.entries(buildDeployEnv(appConfig, { imageTag: gitSha }))) {
    console.info(`${k}=${v}`)
  }
}

if (isMain(import.meta.url)) await main()
