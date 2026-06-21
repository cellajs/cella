import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import type { GenerationMetadata } from '../lib/generation-metadata'
import { getFlag } from './args'

/** The subset of the generation metadata this task reads (sha is always present). */
type RolloutGeneration = Pick<GenerationMetadata, 'service' | 'gen' | 'sha'>

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

export function selectGeneration(items: RolloutGeneration[]): RolloutGeneration {
  return [...items].sort((a, b) => b.gen - a.gen)[0]!
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

  const updates = new Map<string, { gen: number; sha: string }>()
  for (const [service, generations] of byService) {
    const generation = selectGeneration(generations)
    const sha = generation.sha ?? 'latest'
    console.info(`[sync-rollout-config] ${service}: gen=${generation.gen} sha=${sha}`)
    updates.set(service, { gen: generation.gen, sha })
  }

  await writeRolloutStore(stack, updates)
}

/** Mirror the reconciled gen/sha into the S3 control object (the source of truth
 *  compute.ts reads). Full per-service values from live state, so this also seeds
 *  the store on first run. Skipped (with a warning) when no S3 creds are present;
 *  any other failure propagates so a broken reconcile is not silently ignored. */
async function writeRolloutStore(stack: string, updates: Map<string, { gen: number; sha: string }>): Promise<void> {
  if (updates.size === 0) return
  const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
  const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
  if (!accessKey || !secretKey) {
    console.warn('[sync-rollout-config] no S3 credentials; control object not updated (Pulumi config only)')
    return
  }
  process.env.APP_MODE ??= stack.split('/').pop()
  const { appConfig } = await import('shared')
  const { controlActor, controlClientFromEnv, controlKey, readControlState, stateBucket, writeControlState } = await import('../lib/control-store')
  const s3 = await controlClientFromEnv(appConfig.s3.region)
  const bucket = stateBucket(appConfig.slug)
  const key = controlKey(stack)
  const { state, etag } = await readControlState(s3, bucket, key)
  for (const [svc, { gen, sha }] of updates) state.rollout[svc] = { gen, sha }
  state.updatedAt = new Date().toISOString()
  state.updatedBy = controlActor()
  await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : {})
  console.info(`[sync-rollout-config] control object updated (${updates.size} services)`)
}

if (isMain(import.meta.url)) await syncRolloutConfig()