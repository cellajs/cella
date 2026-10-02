import type { ServiceName } from '../compose/compose';
import type { GenerationMetadata } from '../lib/generation-metadata';
import { serviceNames } from '../lib/services';
import {
  controlActor,
  controlContextForStack,
  emptyRollout,
  readControlState,
  type ServiceRollout,
  writeControlState,
} from '../lib/stack/control-store';
import { tryStackOutputRaw } from '../lib/stack/run-pulumi';
import { isRecord } from '../lib/utils/guards';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** The subset of the generation metadata this task reads. */
type RolloutGeneration = Pick<GenerationMetadata, 'service' | 'genId' | 'sha'>;

/**
 * Validate the raw `computeGenerationMetadata` stack output before
 * casting: rows are checked field-by-field. A row with a non-string genId is
 * normalised to '' and filtered out by `seedCandidates`.
 */
export function parseRolloutGenerations(raw: string): RolloutGeneration[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('sync-rollout-config: computeGenerationMetadata output is not an array');
  const rows: RolloutGeneration[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    const { service, genId, sha } = item;
    if (typeof service !== 'string' || typeof sha !== 'string') continue;
    // Only rows for services the registry knows. A stale output row for a
    // removed service must not enter the control object.
    if (!(serviceNames as readonly string[]).includes(service)) continue;
    rows.push({ service: service as ServiceName, sha, genId: typeof genId === 'string' ? genId : '' });
  }
  return rows;
}

/** Deterministic pick when SEEDING a service that has no active pointer yet. On a
 *  first provision there is exactly one generation per service, so the choice is
 *  unambiguous; the genId sort only makes it stable if that ever changes. */
export function selectGeneration(items: RolloutGeneration[]): RolloutGeneration {
  return [...items].sort((a, b) => (a.genId < b.genId ? -1 : a.genId > b.genId ? 1 : 0))[0]!;
}

export function generationsByService(metadata: RolloutGeneration[]): Map<string, RolloutGeneration[]> {
  const services = new Map<string, RolloutGeneration[]>();
  for (const item of metadata) {
    const generations = services.get(item.service) ?? [];
    generations.push(item);
    services.set(item.service, generations);
  }
  return services;
}

/**
 * Build the per-service seed candidates from live metadata. Only CONTENT-ADDRESSED
 * generations qualify: an item whose `genId` is missing/blank is from a pre-migration
 * stack output and must NOT be seeded. Pure + unit-tested.
 */
export function seedCandidates(metadata: RolloutGeneration[]): Map<string, RolloutGeneration> {
  const valid = metadata.filter((item) => typeof item.genId === 'string' && item.genId.length > 0);
  const byService = generationsByService(valid);
  const seeds = new Map<string, RolloutGeneration>();
  for (const [service, generations] of byService) seeds.set(service, selectGeneration(generations));
  return seeds;
}

/**
 * Services whose `active` pointer names a generation the stack no longer has, while the stack does run generations for that service: the VM was
 * destroyed outside a promotion. Planning such a pointer as the overlap partner would recreate the old release's VM, so the pointer is dropped and the
 * next cutover runs as a first deploy. A service with no live generation at all (disabled, folded under singleVM) is left alone.
 */
export function staleActiveServices(rollout: Record<string, ServiceRollout>, metadata: RolloutGeneration[]): string[] {
  const live = generationsByService(metadata.filter((item) => item.genId.length > 0));
  return Object.entries(rollout).flatMap(([service, entry]) => {
    const generations = live.get(service);
    if (!entry.active || !generations) return [];
    return generations.some((item) => item.genId === entry.active?.id) ? [] : [service];
  });
}

export interface ReconcileOptions {
  /**
   * Drop every pending deploy intent. Only the deploy passes this, and it runs under the stack lock, so a `pendingSha` it finds was left by a deploy that
   * failed before promotion. Planning it would provision that release's generation again, under keys minted for the new release.
   */
  resetPending: boolean;
}

/**
 * The control object's rollout pointers reconciled against the generations the stack runs, with one line per change.
 * Stale `active` pointers are dropped (see `staleActiveServices`), and a service with neither an `active` nor a `pendingSha` adopts its live
 * generation as `active`. A service whose stale `active` was just dropped is adopted only under `resetPending`: otherwise its pending deploy cuts over
 * as a first deploy. Under `resetPending` the adopted generation is the live VM the load balancer points at, which the next cutover overlaps and reaps.
 */
export function reconcileRollout(
  rollout: Record<string, ServiceRollout>,
  metadata: RolloutGeneration[],
  opts: ReconcileOptions,
): { rollout: Record<string, ServiceRollout>; changes: string[] } {
  const next: Record<string, ServiceRollout> = structuredClone(rollout);
  const changes: string[] = [];
  if (opts.resetPending) {
    for (const [svc, entry] of Object.entries(next)) {
      if (!entry.pendingSha) continue;
      const { pendingSha, ...rest } = entry;
      next[svc] = rest;
      changes.push(`dropped ${svc}'s pending sha=${pendingSha}: left by a deploy that failed before promotion`);
    }
  }
  const stale = new Set(staleActiveServices(next, metadata));
  for (const svc of stale) {
    const { active, ...rest } = next[svc] ?? emptyRollout();
    next[svc] = rest;
    changes.push(`dropped ${svc}'s active gen=${active?.id} sha=${active?.sha}: the stack no longer has its VM`);
  }
  for (const [svc, gen] of seedCandidates(metadata)) {
    if (stale.has(svc) && !opts.resetPending) continue;
    const current = next[svc] ?? emptyRollout();
    // Do not seed over an existing active, nor while a deploy intent is pending:
    // the orchestrator promotes the pending generation after its health gate.
    if (current.active || current.pendingSha) continue;
    const seq = current.seq + 1;
    next[svc] = { ...current, seq, active: { id: gen.genId, sha: gen.sha, seq } };
    changes.push(`seeded ${svc}: active gen=${gen.genId} sha=${gen.sha}`);
  }
  return { rollout: next, changes };
}

export async function syncRolloutConfig(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack');
  if (!stack) throw new Error('Usage: sync-rollout-config.ts --stack <stack> [--reset-pending]');
  const opts: ReconcileOptions = { resetPending: argv.includes('--reset-pending') };

  const rawMetadata = tryStackOutputRaw(stack, 'computeGenerationMetadata');
  if (!rawMetadata) {
    console.info('[sync-rollout-config] no computeGenerationMetadata output yet; skipping');
    return;
  }

  const metadata = parseRolloutGenerations(rawMetadata);
  if (!metadata.some((item) => item.genId.length > 0)) {
    console.info('[sync-rollout-config] no content-addressed generations in live state yet; nothing to seed');
    return;
  }

  await writeReconciledRollout(stack, metadata, opts);
}

/**
 * Apply `reconcileRollout` to the control object. Without `resetPending` it never promotes a pending generation or demotes a live active: the
 * orchestrator (deploy-service) owns promotion after a health-gated cutover, so a freshly provisioned but un-cutover generation must not be treated
 * as live. Skipped (with a warning) when no S3 creds are present.
 */
async function writeReconciledRollout(stack: string, metadata: RolloutGeneration[], opts: ReconcileOptions): Promise<void> {
  const ctx = await controlContextForStack(stack, (msg) => console.warn(`[sync-rollout-config] ${msg}`));
  if (!ctx) return;
  const { s3, bucket, controlKey: key } = ctx;
  const { state, etag } = await readControlState(s3, bucket, key);

  const { rollout, changes } = reconcileRollout(state.rollout, metadata, opts);
  if (changes.length === 0) {
    console.info('[sync-rollout-config] all services already have a live active pointer or a pending deploy; nothing to seed');
    return;
  }
  for (const change of changes) console.warn(`[sync-rollout-config] ${change}`);
  state.rollout = rollout;
  state.updatedAt = new Date().toISOString();
  state.updatedBy = controlActor();
  await writeControlState(s3, bucket, key, state, etag ? { ifMatch: etag } : {});
  console.info('[sync-rollout-config] control object updated');
}

if (isMain(import.meta.url)) await syncRolloutConfig();
