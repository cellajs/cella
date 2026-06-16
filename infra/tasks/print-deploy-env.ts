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
import { pathToFileURL } from 'node:url'
import type { appConfig as AppConfig } from '../../shared'
import { deriveInfra } from '../lib/naming'

type Cfg = typeof AppConfig

/** Exact set of keys this script is allowed to emit. Tests lock this. */
export const ALLOWED_KEYS = [
  'pulumi_stack',
  'region',
  'registry_ns',
  'frontend_bucket',
  'state_bucket',
  'deploy_tags_bucket',
  'vm_reader_app',
  'frontend_url',
  'backend_url',
  'yjs_url',
  'ai_url',
  'has_yjs',
  'has_ai',
] as const
export type AllowedKey = (typeof ALLOWED_KEYS)[number]

/** Pure builder — given an appConfig, produce the deploy env table. */
export function buildDeployEnv(appConfig: Cfg): Record<AllowedKey, string> {
  const { naming } = deriveInfra(appConfig)
  return {
    pulumi_stack: appConfig.mode,
    region: appConfig.s3.region,
    registry_ns: naming.registryNamespace,
    frontend_bucket: naming.frontendBucket,
    state_bucket: naming.pulumiStateBucket,
    deploy_tags_bucket: naming.deployTagsBucket,
    // Deterministic IAM application name for the VM reader identity. CI's
    // "Verify VM reader IAM grant" step resolves the application id by this
    // name (the id is no longer stored in stack config — SOVRUN §3.3).
    vm_reader_app: `${appConfig.slug}-vm-reader`,
    frontend_url: appConfig.frontendUrl,
    backend_url: appConfig.backendUrl,
    yjs_url: appConfig.yjsUrl,
    ai_url: appConfig.aiUrl,
    // Feature flags — the deploy workflow gates the yjs/ai build + roll matrix
    // entries on these so a fork with the feature disabled (e.g. the cella
    // template itself) doesn't try to build/health-check a service whose
    // infra (DNS/LB/cert) is intentionally never provisioned.
    has_yjs: String(appConfig.features.yjs),
    has_ai: String(appConfig.features.ai),
  }
}

export async function main(): Promise<void> {
  const mode = process.argv[2]
  if (!mode) {
    console.error('Usage: print-deploy-env.ts <staging|production>')
    process.exit(1)
  }
  process.env.APP_MODE = mode
  const { appConfig } = await import('shared')
  if (appConfig.mode !== mode) {
    console.error(`Mode mismatch: requested "${mode}" but loaded config is "${appConfig.mode}"`)
    process.exit(1)
  }
  for (const [k, v] of Object.entries(buildDeployEnv(appConfig))) {
    console.info(`${k}=${v}`)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
