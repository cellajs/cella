import { isMain } from '../lib/utils/is-main'
import { controlContextForStack, emptyRollout, controlActor, readControlState, writeControlState } from '../lib/stack/control-store'
import type { GenerationMetadata } from '../lib/generation-metadata'
import { isRecord } from '../lib/utils/guards'
import { tryStackOutputRaw } from '../lib/stack/run-pulumi'
import { serviceNames } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { getFlag } from './args'

/** The subset of the generation metadata this task reads. */
type RolloutGeneration = Pick<GenerationMetadata, 'service' | 'genId' | 'sha'>

/**
 * Validate the raw `computeGenerationMetadata` stack output before
 * casting: rows are checked field-by-field. A row with a non-string genId is
 * normalised to '' and filtered out by `seedCandidates`.
 */
export function parseRolloutGenerations(raw: string): RolloutGeneration[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('sync-rollout-config: computeGenerationMetadata output is not an array')
  const rows: RolloutGeneration[] = []
  for (const item of parsed) {
    if (!isRecord(item)) continue
    const { service, genId, sha } = item
    if (typeof service !== 'string' || typeof sha !== 'string') continue
    // Only rows for services the registry knows. A stale output row for a
    // removed service must not enter the control object.
    if (!(serviceNames as readonly string[]).includes(service)) continue
    rows.push({ service: service as ServiceName, sha, genId: typeof genId === 'string' ? genId : '' })
  }
  return rows
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

/**
 * Build the per-service seed candidates from live metadata. Only CONTENT-ADDRESSED
 * generations qualify: an item whose `genId` is missing/blank is from a pre-migration
 * stack output and must NOT be seeded. Pure + unit-tested.
 */
export function seedCandidates(metadata: RolloutGeneration[]): Map<string, RolloutGeneration> {
  const valid = metadata.filter((item) => typeof item.genId === 'string' && item.genId.length > 0)
  const byService = generationsByService(valid)
  const seeds = new Map<string, RolloutGeneration>()
  for (const [service, generations] of byService) seeds.set(service, selectGeneration(generations))
  return seeds
}

export async function syncRolloutConfig(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack')
  if (!stack) throw new Error('Usage: sync-rollout-config.ts --stack <stack>')

  const rawMetadata = tryStackOutputRaw(stack, 'computeGenerationMetadata')
  if (!rawMetadata) {
    console.info('[sync-rollout-config] no computeGenerationMetadata output yet; skipping')
    return
  }

  const seeds = seedCandidates(parseRolloutGenerations(rawMetadata))
  if (seeds.size === 0) {
    console.info('[sync-rollout-config] no content-addressed generations in live state yet; nothing to seed')
    return
  }

  await seedActivePointers(stack, seeds)
}

/**
 * Initialize the `active` pointer for any service that has none yet: first adoption
 * of a live generation into the control object. Deliberately NEVER promotes a pending
 * generation or demotes an existing active: the orchestrator (deploy-service)
 * owns promotion after a health-gated cutover, so a freshly provisioned but
 * un-cutover generation must not be treated as live. A service that already has an `active` OR a `pendingSha`
 * is skipped entirely. Skipped (with a warning) when no S3 creds are present.
 */
async function seedActivePointers(stack: string, seeds: Map<string, RolloutGeneration>): Promise<void> {
  if (seeds.size === 0) return
  const ctx = await controlContextForStack(stack, (msg) => console.warn(`[sync-rollout-config] ${msg}`))
  if (!ctx) return
  const { s3, bucket, controlKey: key } = ctx
  const { state, etag } = await readControlState(s3, bucket, key)

  let changed = false
  for (const [svc, gen] of seeds) {
    const current = state.rollout[svc] ?? emptyRollout()
    // Do not seed over an existing active, nor while a deploy intent is pending:
    // the orchestrator promotes the pending generation after its health gate.
    if (current.active || current.pendingSha) continue
    const seq = current.seq + 1
    state.rollout[svc] = { ...current, seq, active: { id: gen.genId, sha: gen.sha, seq } }
    console.info(`[sync-rollout-config] seeded ${svc}: active gen=${gen.genId} sha=${gen.sha}`)
    changed = true
  }
  if (!changed) {
    console.info('[sync-rollout-config] all services already have an active pointer or a pending deploy; nothing to seed')
    return
  }
  state.updatedAt = new Date().toISOString()
  state.updatedBy = controlActor()
  await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : {})
  console.info('[sync-rollout-config] control object updated')
}

if (isMain(import.meta.url)) await syncRolloutConfig()
