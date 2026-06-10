/**
 * Wait for the release images to appear in the Scaleway container registry.
 *
 * The on-VM reconciler does `docker compose pull` the moment the new SHA lands
 * in the deploy-tags bucket, and a fresh/replaced VM pulls during cloud-init.
 * We must not let the deploy proceed before those images exist.
 *
 * Which services have their own image is derived here from a single source so
 * it can't silently drift from the reconciler/deploy-tags service lists:
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
import { pathToFileURL } from 'node:url'
import { imageServiceNames, serviceNames, services, type ServiceName } from '../lib/services'
import { getFlag, getNumFlag, sleep } from './cli'

/**
 * Every service that has an entry in the canonical service registry
 * (`infra/lib/services.ts`). Derived from there so it can't drift.
 */
export const TAGGED_SERVICES = serviceNames
export type TaggedService = ServiceName

/**
 * Services that do NOT ship their own image, mapped to the image they reuse.
 * `ai` runs on its own VM but pulls the backend image at the same SHA.
 */
export const IMAGE_REUSE: Partial<Record<ServiceName, ServiceName>> = Object.fromEntries(
  services.filter((s) => s.reusesImageOf).map((s) => [s.slug, s.reusesImageOf]),
) as Partial<Record<ServiceName, ServiceName>>

/** Tagged services that ship an independent image and must exist in the registry. */
export function imageServices(): TaggedService[] {
  return imageServiceNames
}

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
   * Override which image services to wait for. Defaults to `imageServices()`.
   * The deploy workflow passes the feature-gated build set here so a fork with
   * yjs/ai disabled doesn't wait for an image that is never built.
   */
  services?: TaggedService[]
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
  for (const service of opts.services ?? imageServices()) {
    const ref = imageRef(opts.registry, opts.namespace, service, opts.tag)
    log(`Waiting for ${service}:${opts.tag}`)
    let ready = false
    for (let i = 1; i <= attempts; i++) {
      if (await opts.inspect(ref)) {
        log(`  ${service} ready after ${i} attempt(s)`)
        ready = true
        break
      }
      if (i < attempts) await sleepFn(intervalMs)
    }
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
  services?: TaggedService[]
  attempts: number
  intervalMs: number
}

/** Parse `--key value` flags. Exported for testing. */
export function parseArgs(argv: string[]): CliArgs {
  const registry = getFlag(argv, '--registry')
  const namespace = getFlag(argv, '--ns')
  const tag = getFlag(argv, '--tag')
  if (!registry || !namespace || !tag) {
    throw new Error('Usage: wait-for-images.ts --registry <host> --ns <namespace> --tag <git-sha> [--attempts N] [--interval ms] [--services a,b,c]')
  }

  // Optional comma-separated override; restrict to known image services so an
  // unknown or reuse-only service (e.g. `ai`) can't sneak into the wait loop.
  const servicesFlag = getFlag(argv, '--services')
  const services = servicesFlag
    ? servicesFlag
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is TaggedService => (imageServices() as string[]).includes(s))
    : undefined

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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
