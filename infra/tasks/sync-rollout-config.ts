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
 * Services whose `active` pointer names a generation the stack no longer has: the VM was destroyed outside a promotion. Planning such a pointer as
 * the overlap partner would recreate the old release's VM, so the pointer is dropped and the next cutover runs as a first deploy.
 * A service the stack runs no generation of at all counts only when `deployed` names it, as the config then gives it a VM the stack lacks. Without
 * `deployed` it is skipped: it may be folded onto the singleVM host or disabled, and `reconcileRollout` drops such entries under `resetPending`.
 */
export function staleActiveServices(
  rollout: Record<string, ServiceRollout>,
  metadata: RolloutGeneration[],
  deployed?: ReadonlySet<string>,
): string[] {
  const live = generationsByService(metadata.filter((item) => item.genId.length > 0));
  return Object.entries(rollout).flatMap(([service, entry]) => {
    if (!entry.active) return [];
    const generations = live.get(service) ?? (deployed?.has(service) ? [] : undefined);
    if (!generations) return [];
    return generations.some((item) => item.genId === entry.active?.id) ? [] : [service];
  });
}

/**
 * `resetPending` drops every pending deploy intent. Only the deploy passes it, and it runs under the stack lock, so a `pendingSha` it finds was left by
 * a deploy that failed before promotion. Planning it would provision that release's generation again, under keys minted for the new release.
 * `deployed` lists the services the config gives their own VM, the ones the rollout cuts over. Every other service's entry is dropped: a service
 * folded onto the singleVM host, or disabled, has no VM, and a leftover `active` would plan as a preexisting generation with no minted keys once
 * the service boots its own VM again.
 */
export type ReconcileOptions = { resetPending: false } | { resetPending: true; deployed: readonly string[] };

/** One line naming what a dropped rollout entry held. */
function describeEntry(entry: ServiceRollout): string {
  const parts = [
    ...(entry.active ? [`active gen=${entry.active.id} sha=${entry.active.sha}`] : []),
    ...(entry.pendingSha ? [`pending sha=${entry.pendingSha}`] : []),
  ];
  return parts.join(', ') || 'no pointers';
}

/**
 * The control object's rollout pointers reconciled against the generations the stack runs, with one line per change.
 * Under `resetPending`, entries of services the config deploys no VM for are dropped first, then every leftover `pendingSha`.
 * Stale `active` pointers are dropped (see `staleActiveServices`), and a service with neither an `active` nor a `pendingSha` adopts its live
 * generation as `active`. A service whose stale `active` was just dropped is adopted only under `resetPending`: otherwise its pending deploy cuts over
 * as a first deploy. Under `resetPending` the adopted generation is the live VM the load balancer points at, which the next cutover overlaps and reaps.
 */
export function reconcileRollout(
  rollout: Record<string, ServiceRollout>,
  metadata: RolloutGeneration[],
  opts: ReconcileOptions,
): { rollout: Record<string, ServiceRollout>; changes: string[] } {
  let next: Record<string, ServiceRollout> = structuredClone(rollout);
  const changes: string[] = [];
  const deployed = opts.resetPending ? new Set(opts.deployed) : undefined;
  if (deployed) {
    for (const [svc, entry] of Object.entries(next)) {
      if (deployed.has(svc)) continue;
      changes.push(`dropped ${svc}'s rollout entry (${describeEntry(entry)}): the config gives it no VM of its own`);
    }
    next = Object.fromEntries(Object.entries(next).filter(([svc]) => deployed.has(svc)));
    for (const [svc, entry] of Object.entries(next)) {
      if (!entry.pendingSha) continue;
      const { pendingSha, ...rest } = entry;
      next[svc] = rest;
      changes.push(`dropped ${svc}'s pending sha=${pendingSha}: left by a deploy that failed before promotion`);
    }
  }
  const stale = new Set(staleActiveServices(next, metadata, deployed));
  for (const svc of stale) {
    const { active, ...rest } = next[svc] ?? emptyRollout();
    next[svc] = rest;
    changes.push(`dropped ${svc}'s active gen=${active?.id} sha=${active?.sha}: the stack no longer has its VM`);
  }
  for (const [svc, gen] of seedCandidates(metadata)) {
    // A VM of a service the config no longer deploys is reaped by the next stack update, never adopted.
    if (deployed && !deployed.has(svc)) continue;
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

/** `--deployed <slug,...>`, required with `--reset-pending`: an empty list would drop every pointer. */
export function parseReconcileOptions(argv: string[]): ReconcileOptions {
  if (!argv.includes('--reset-pending')) return { resetPending: false };
  const deployed = (getFlag(argv, '--deployed') ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);
  if (deployed.length === 0) throw new Error('sync-rollout-config: --reset-pending needs --deployed <slug,...>, the services the config gives a VM');
  return { resetPending: true, deployed };
}

export async function syncRolloutConfig(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack');
  if (!stack) throw new Error('Usage: sync-rollout-config.ts --stack <stack> [--reset-pending --deployed <slug,...>]');
  const opts = parseReconcileOptions(argv);

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
