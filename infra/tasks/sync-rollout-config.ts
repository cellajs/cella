import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import type { GenerationMetadata } from '../lib/generation-metadata'
import { getFlag } from './args'

/** The subset of the generation metadata this task reads. */
type RolloutGeneration = Pick<GenerationMetadata, 'service' | 'genId' | 'sha'>

function runPulumi(args: string[], opts: { allowFailure?: boolean } = {}): string {
  const res = spawnSync('pulumi', args, {
    cwd: new URL('..', import.meta.url).pathname,
    env: process.env,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.status !== 0 && !opts.allowFailure) throw new Error(`pulumi ${args.join(' ')} failed with exit ${res.status}`)
  return res.stdout.trim()
}

function stackOutput(stack: string, name: string): string | undefined {
  return runPulumi(['stack', 'output', name, '--stack', stack, '--json'], { allowFailure: true }).trim() || undefined
}

/** Deterministic pick when SEEDING a service that has no active pointer yet. On a
 *  first provision there is exactly one generation per service, so the choice is
 *  unambiguous; the genId sort only makes it stable if that ever changes. */
export function selectGeneration(items: RolloutGeneration[]): RolloutGeneration {
  return [...items].sort((a, b) => (a.genId < b.genId ? -1 : a.genId > b.genId ? 1 : 0))[0]!
}

export function generationsByService(metadata: RolloutGeneration[]): Map<string, RolloutGeneration[]> {
  const services = new Map<string, RolloutGeneration[]>()
  for (const item of metadata) {
    const generations = services.get(item.service) ?? []
    generations.push(item)
    services.set(item.service, generations)
  }
  return services
}

export async function syncRolloutConfig(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack')
  if (!stack) throw new Error('Usage: sync-rollout-config.ts --stack <stack>')

  const rawMetadata = stackOutput(stack, 'computeGenerationMetadata')
  if (!rawMetadata) {
    console.info('[sync-rollout-config] no computeGenerationMetadata output yet; skipping')
    return
  }

  const metadata = JSON.parse(rawMetadata) as RolloutGeneration[]
  const byService = generationsByService(metadata)

  const seeds = new Map<string, RolloutGeneration>()
  for (const [service, generations] of byService) {
    seeds.set(service, selectGeneration(generations))
  }

  await seedActivePointers(stack, seeds)
}

/**
 * Seed the `active` pointer for any service that has none yet — first adoption
 * of a live generation into the ledger. Deliberately NEVER promotes a pending
 * generation or demotes an existing active: the orchestrator (deploy-service)
 * owns promotion after a health-gated cutover, so a freshly-materialised but
 * un-cutover generation must not be mistaken for "live" here (that was the old
 * max-gen reconcile bug). Skipped (with a warning) when no S3 creds are present.
 */
async function seedActivePointers(stack: string, seeds: Map<string, RolloutGeneration>): Promise<void> {
  if (seeds.size === 0) return
  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) {
    console.warn('[sync-rollout-config] no S3 credentials; control object not updated')
    return
  }
  process.env.APP_MODE ??= stack.split('/').pop()
  const { appConfig } = await import('shared')
  const { controlActor, controlClientFromEnv, controlKey, emptyRollout, readControlState, stateBucket, writeControlState } = await import('../lib/control-store')
  const s3 = await controlClientFromEnv(appConfig.s3.region)
  const bucket = stateBucket(appConfig.slug)
  const key = controlKey(stack)
  const { state, etag } = await readControlState(s3, bucket, key)

  let changed = false
  for (const [svc, gen] of seeds) {
    const current = state.rollout[svc] ?? emptyRollout()
    if (current.active) continue
    const seq = current.seq + 1
    state.rollout[svc] = { ...current, seq, active: { id: gen.genId, sha: gen.sha, seq } }
    console.info(`[sync-rollout-config] seeded ${svc}: active gen=${gen.genId} sha=${gen.sha}`)
    changed = true
  }
  if (!changed) {
    console.info('[sync-rollout-config] all services already have an active pointer; nothing to seed')
    return
  }
  state.updatedAt = new Date().toISOString()
  state.updatedBy = controlActor()
  await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : {})
  console.info('[sync-rollout-config] control object updated')
}

if (isMain(import.meta.url)) await syncRolloutConfig()