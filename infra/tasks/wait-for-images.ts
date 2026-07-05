/**
 * Wait for the release images to appear in the Scaleway container registry.
 *
 * A fresh/replaced VM pulls the pinned release SHA during cloud-init. We must
 * not let the deploy proceed before those images exist.
 *
 * Which services have their own image is derived here from a single source so
 * it can't silently drift from the service registry:
 *   - `ai` reuses the backend image, so there is no `ai:<tag>` to wait for —
 *     it is intentionally excluded.
 *   - every other tagged service ships its own image and is waited on.
 *
 * Inspection uses `docker buildx imagetools inspect` because Scaleway's
 * registry rejects Basic auth on /v2/ and requires the Docker bearer-token
 * flow. `docker login` must already have run before this task.
 *
 * Usage:
 *   tsx infra/tasks/wait-for-images.ts --registry rg.<region>.scw.cloud \
 *     --ns <namespace> --tag <git-sha> [--attempts 80] [--interval 15000]
 */
import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import { pollUntil } from '../lib/retry'
import { parseServiceRows } from '../lib/service-rows'
import { imageServiceNames } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { getFlag, getNumFlag, sleep } from './args'

/** Inspect a single image ref; resolves true if it exists. Injectable for tests. */
export type InspectFn = (imageRef: string) => Promise<boolean>

/** Default inspector — `docker buildx imagetools inspect <ref>` (no shell). */
export const dockerInspect: InspectFn = async (imageRef) => {
  const { status } = spawnSync('docker', ['buildx', 'imagetools', 'inspect', imageRef], { stdio: 'ignore' })
  return status === 0
}

export interface WaitOptions {
  registry: string
  namespace: string
  tag: string
  inspect: InspectFn
  /**
   * Override which image services to wait for. Defaults to `imageServiceNames`
   * (the canonical registry-derived list, which already excludes image-reuse
   * services like `ai`). The deploy workflow passes the feature-gated build set
   * here so a fork with yjs/ai disabled doesn't wait for an image that is never
   * built.
   */
  services?: ServiceName[]
  attempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  log?: (msg: string) => void
}

/** Build the fully-qualified image reference for a service at the release tag. */
export function imageRef(registry: string, namespace: string, service: string, tag: string): string {
  return `${registry}/${namespace}/${service}:${tag}`
}

/** Poll the registry until every image service's tag exists, or budgets run out. */
export async function waitForImages(opts: WaitOptions): Promise<{ ok: boolean; missing: string[] }> {
  const attempts = opts.attempts ?? 80
  const intervalMs = opts.intervalMs ?? 15000
  const sleepFn = opts.sleep ?? sleep
  const log = opts.log ?? ((msg: string) => console.info(msg))

  const missing: string[] = []
  for (const service of opts.services ?? imageServiceNames) {
    const ref = imageRef(opts.registry, opts.namespace, service, opts.tag)
    log(`Waiting for ${service}:${opts.tag}`)
    const ready = await pollUntil(
      async (attempt) => {
        if (!(await opts.inspect(ref))) return undefined
        log(`  ${service} ready after ${attempt} attempt(s)`)
        return true
      },
      { attempts, intervalMs, sleep: sleepFn },
    )
    if (!ready) {
      log(`::error::${ref} never appeared in registry`)
      missing.push(ref)
    }
  }

  return { ok: missing.length === 0, missing }
}

interface CliArgs {
  registry: string
  namespace: string
  tag: string
  services?: ServiceName[]
  attempts: number
  intervalMs: number
}

export function imageServicesFromBuildMatrix(raw: string): ServiceName[] {
  return parseServiceRows(raw, '--build-images-json', { required: ['service'] })
    .map((row) => row.service)
    .filter((service): service is ServiceName => (imageServiceNames as string[]).includes(service))
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const registry = getFlag(argv, '--registry')
  const namespace = getFlag(argv, '--ns')
  const tag = getFlag(argv, '--tag')
  if (!registry || !namespace || !tag) {
    throw new Error('Usage: wait-for-images.ts --registry <host> --ns <namespace> --tag <git-sha> [--attempts N] [--interval ms] [--build-images-json <matrix>]')
  }

  // The deploy workflow passes the feature-gated build matrix; restrict to known
  // image services so a reuse-only service (e.g. `ai`) can't sneak into the wait
  // loop. Omitted → wait for every image service (manual/local runs).
  const buildImagesRaw = getFlag(argv, '--build-images-json')
  const services = buildImagesRaw ? imageServicesFromBuildMatrix(buildImagesRaw) : undefined

  return {
    registry,
    namespace,
    tag,
    services,
    attempts: getNumFlag(argv, '--attempts', 80),
    intervalMs: getNumFlag(argv, '--interval', 15000),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv)
  const outcome = await waitForImages({
    registry: args.registry,
    namespace: args.namespace,
    tag: args.tag,
    services: args.services,
    attempts: args.attempts,
    intervalMs: args.intervalMs,
    inspect: dockerInspect,
  })

  if (!outcome.ok) {
    console.error(`::error::Images never appeared: ${outcome.missing.join(', ')}`)
    process.exit(1)
  }
}

if (isMain(import.meta.url)) await main()
