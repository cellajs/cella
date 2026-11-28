import { onlineManager } from '@tanstack/react-query';
import type { StreamChange } from 'sdk';
import { type ProductEntityType, pathSegments } from 'shared';
import { hashSpread } from 'shared/utils/spread-hash';
import { isRateLimited } from '~/lib/api';
import { msUntilBudget } from '~/lib/reported-budgets';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { productTypeOf } from '~/query/cache-migration';
import { sourceId } from '~/query/offline/hlc';
import { queryClient } from '~/query/query-client';
import * as cacheOps from '~/query/realtime/cache-ops';
import { propagateEmbeddings } from '~/query/realtime/propagation';
import { publishSyncedRows } from '~/query/realtime/sync-events';
import { getSyncTier, isViewingChannel, type SyncTier, tierBackground } from '~/query/realtime/sync-priority';
import { syncStore } from '~/query/realtime/sync-store';
import { getRouter } from '~/routes/-router-instance';

/** Spread window of a range that carries none from the server, such as a catchup gap. */
const defaultSpreadWindowMs = 15_000;
/** Transient fetch errors retry with exponential backoff before falling back to invalidation. */
const maxFlushAttempts = 3;
const retryBaseMs = 2_000;
/** Re-check delay while offline, where a fetch would fail; catchup reconciles on reconnect. */
const offlineRecheckMs = 5_000;

interface DirtyEntry {
  productType: ProductEntityType;
  organizationId: string;
  tenantId: string | null;
  channelId: string | null;
  /** The product path of the announced rows, organization first: the stream frame's `path`. */
  path: string;
  afterSeq: number;
  untilSeq: number;
  dueAt: number;
  hasCreates: boolean;
  attempts: number;
  propagations: NonNullable<StreamChange['propagation']>[];
  /** The `rangeKey` of the newest frame that announced this range: the server takes a key for seconds. */
  rangeKey?: string;
}

type EnqueueInput = Pick<
  DirtyEntry,
  'productType' | 'organizationId' | 'tenantId' | 'channelId' | 'path' | 'afterSeq' | 'untilSeq' | 'hasCreates' | 'rangeKey'
> & {
  spreadWindow?: number | null;
  propagation?: StreamChange['propagation'];
};

const dirty = new Map<string, DirtyEntry>();
/** Reads running per product type and organization, by `groupOf`: no range read of a group starts while it has one. */
const busyGroups = new Map<string, number>();
let timer: ReturnType<typeof setTimeout> | null = null;
let holdTimer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

const entryKey = (productType: ProductEntityType, organizationId: string, channelId: string | null) =>
  `${productType}:${channelId ?? organizationId}`;
const groupOf = ({ productType, organizationId }: Pick<DirtyEntry, 'productType' | 'organizationId'>) => `${productType}:${organizationId}`;

/** The negotiated delay: client tier bounds the server-spread slot. */
function negotiatedDelay(tier: SyncTier, channelViewKey: string, windowMs: number): number {
  const spread = windowMs > 0 ? hashSpread(`${sourceId}:${channelViewKey}`) % windowMs : 0;
  return Math.min(Math.max(tier.min, spread), tier.max);
}

/** Enqueue an announced seq range for lazy fetching; a muted or hidden scope waits until it is opened. */
export function enqueueRange(input: EnqueueInput): void {
  enqueueWithTier(input, getSyncTier(input.organizationId, input.channelId));
}

/** Enqueue catchup gaps, including muted views in spread background work so persisted caches converge. */
export function enqueueCatchupRange(input: EnqueueInput): void {
  const tier = getSyncTier(input.organizationId, input.channelId);
  enqueueWithTier(input, tier.min === Number.POSITIVE_INFINITY ? tierBackground : tier);
}

function enqueueWithTier(input: EnqueueInput, tier: SyncTier): void {
  const { productType, organizationId, tenantId, channelId, path, afterSeq, untilSeq, hasCreates, propagation } = input;
  if (!hasEntityQueryKeys(productType)) return;

  const caughtUp = syncStore.getState().getScopeSeq(organizationId, channelId, productType);
  if (untilSeq <= caughtUp) return;

  // Anchoring after the caught-up position heals missed-change gaps and trims already-ingested overlap; with no baseline, trust the change's own range.
  const anchoredAfter = caughtUp > 0 ? caughtUp : afterSeq;

  const key = entryKey(productType, organizationId, channelId);
  // The on-open tier gives an infinite delay: the entry waits for promoteLiveChannels.
  const dueAt = Date.now() + negotiatedDelay(tier, key, input.spreadWindow ?? defaultSpreadWindowMs);
  const entry: DirtyEntry = {
    productType,
    organizationId,
    tenantId,
    channelId,
    path,
    afterSeq: anchoredAfter,
    untilSeq,
    dueAt,
    hasCreates,
    attempts: 0,
    propagations: propagation ? [propagation] : [],
    rangeKey: input.rangeKey,
  };

  const existing = dirty.get(key);
  if (existing) {
    mergeRange(existing, entry);
    if (entry.rangeKey) existing.rangeKey = entry.rangeKey;
    existing.path = entry.path;
    // More news never postpones.
    existing.dueAt = Math.min(existing.dueAt, dueAt);
  } else {
    dirty.set(key, entry);
  }

  installListeners();
  armTimer();
}

/** Attach a catchup propagation hint to the pending org range of the hint's embedded product, so it runs after the fetch that ingests the fresh embedded rows. False when nothing is pending for that scope; the caller then propagates at once. */
export function attachPendingPropagation(
  productType: ProductEntityType,
  organizationId: string,
  propagation: NonNullable<StreamChange['propagation']>,
): boolean {
  const entry = dirty.get(entryKey(productType, organizationId, null));
  if (!entry) return false;
  entry.propagations.push(propagation);
  return true;
}

/** Flush every dirty scope now except those waiting to be opened (tab hiding, tests). */
export function flushAllNow(): Promise<void> {
  for (const entry of dirty.values()) if (entry.dueAt !== Number.POSITIVE_INFINITY) entry.dueAt = 0;
  return flushDue();
}

/**
 * Flush one foreground catchup view before mutation replay; a single failed attempt invalidates and advances. It reads
 * beside a running read of its group, and leaves the view queued while the read budget is spent.
 */
export async function flushChannelViewNow(
  productType: ProductEntityType,
  organizationId: string,
  channelId: string | null,
): Promise<'ok' | 'fallback' | 'requeued' | 'none'> {
  const key = entryKey(productType, organizationId, channelId);
  const entry = dirty.get(key);
  if (!entry) return 'none';
  if (msUntilBudget('read', 0)) return 'requeued';
  dirty.delete(key);
  return excludingRangeReads(productType, organizationId, () => flushGroup([{ ...entry, attempts: maxFlushAttempts - 1 }]));
}

/** Runs `read` while no range read of its product type and organization starts: one read at a time keeps their patches in order. */
export async function excludingRangeReads<T>(productType: ProductEntityType, organizationId: string, read: () => Promise<T>): Promise<T> {
  const group = groupOf({ productType, organizationId });
  busyGroups.set(group, (busyGroups.get(group) ?? 0) + 1);
  try {
    return await read();
  } finally {
    const left = (busyGroups.get(group) ?? 1) - 1;
    if (left) busyGroups.set(group, left);
    else busyGroups.delete(group);
    armTimer();
  }
}

/** Clear all pending work. Called when a catchup reset the cursors: the pending ranges name positions of another history. */
export function resetFetchPrioritizer(): void {
  dirty.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** When an entry may read: its tier's due time, not before the read budget has reads left, and never while its group reads. */
function readableAt(entry: DirtyEntry, now: number): number {
  if (busyGroups.has(groupOf(entry))) return Number.POSITIVE_INFINITY;
  // The budget is one per user: a refused read holds every group.
  const heldMs = msUntilBudget('read', 0);
  return heldMs ? Math.max(entry.dueAt, now + heldMs) : entry.dueAt;
}

function armTimer(): void {
  const now = Date.now();
  let earliest = Number.POSITIVE_INFINITY;
  for (const entry of dirty.values()) earliest = Math.min(earliest, readableAt(entry, now));
  // Nothing is due before an open or before its group's read ends: a timeout past 2^31-1 ms would fire at once.
  if (earliest === Number.POSITIVE_INFINITY) return;

  const delay = Math.max(0, earliest - now);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushDue();
  }, delay);
}

async function flushDue(): Promise<void> {
  const now = Date.now();
  // Covering fetch: all due channels of one (productType, org) share one bounded fetch, and rows route to their home lists during patching.
  const groups = new Map<string, DirtyEntry[]>();
  for (const [key, entry] of dirty) {
    if (readableAt(entry, now) > now) continue;
    // In-flight ranges leave the map; changes that arrive meanwhile wait there for the next read.
    dirty.delete(key);
    const group = groups.get(groupOf(entry));
    if (group) group.push(entry);
    else groups.set(groupOf(entry), [entry]);
  }
  await Promise.all(
    [...groups.values()].map((entries) => excludingRangeReads(entries[0].productType, entries[0].organizationId, () => flushGroup(entries))),
  );
  armTimer();
}

/** The deepest channel every due path lies under, for one narrowed range fetch; undefined when only the organization covers them all. */
function coveringChannelId(entries: DirtyEntry[]): string | undefined {
  let common = pathSegments(entries[0].path);
  for (const { path } of entries.slice(1)) {
    const segments = pathSegments(path);
    let i = 0;
    while (i < common.length && common[i] === segments[i]) i++;
    common = common.slice(0, i);
  }
  // The first segment is the organization, whose read is the unnarrowed one.
  return common.length > 1 ? common.at(-1) : undefined;
}

/** Flush one covering group: fetch the merged range once, then settle every entry from it. */
async function flushGroup(due: DirtyEntry[]): Promise<'ok' | 'fallback' | 'requeued'> {
  const { productType, organizationId } = due[0];
  const tenantId = due.find((entry) => entry.tenantId)?.tenantId ?? null;

  if (!onlineManager.isOnline()) {
    for (const entry of due) requeue(entry, offlineRecheckMs);
    return 'requeued';
  }

  // A read that waited behind another starts where that one ended, and an entry whose range the cursor passed reads nothing.
  const entries: DirtyEntry[] = [];
  for (const entry of due) {
    const caughtUp = syncStore.getState().getScopeSeq(organizationId, entry.channelId, productType);
    if (entry.untilSeq > caughtUp) entries.push({ ...entry, afterSeq: caughtUp > 0 ? caughtUp : entry.afterSeq });
    else for (const propagation of entry.propagations) propagateEmbeddings(propagation);
  }
  if (!entries.length) return 'ok';

  const afterSeq = Math.min(...entries.map((entry) => entry.afterSeq));
  const untilSeq = Math.max(...entries.map((entry) => entry.untilSeq));
  const keys = getEntityQueryKeys(productType);
  const channelId = coveringChannelId(entries);
  const rangeKey = entries.find((entry) => entry.rangeKey)?.rangeKey;
  const result = await cacheOps.fetchRangeAndPatch(productType, organizationId, tenantId, { afterSeq, untilSeq }, keys, channelId, rangeKey);

  // A refusal counts no attempt and marks no list: the range keeps its cursor and reads once the budget has reads left.
  if (result.status === 'limited') {
    for (const entry of entries) requeue(entry, 0);
    refetchRefusedAfterHold();
    return 'requeued';
  }

  if (result.status === 'error' && entries.some((entry) => entry.attempts + 1 < maxFlushAttempts)) {
    for (const entry of entries) requeue({ ...entry, attempts: entry.attempts + 1 }, retryBaseMs * 2 ** entry.attempts);
    return 'requeued';
  }

  // Each due channel advances to the shared upper bound, also past a range not delivered whole: its refetch mark recovers it, and no later catchup fetches it again.
  for (const entry of entries) syncStore.getState().setScopeSeq(organizationId, entry.channelId, productType, untilSeq);

  // The org id is the fallback home for rows without ancestor ids.
  if (result.status === 'ok') publishSyncedRows({ productType, organizationId, rows: result.items });

  // Overflow, unsupported, exhausted retries, or fewer rows than announced: a row changed again since, one this reader may not read, or one deleted with its channel.
  const undelivered = result.status !== 'ok' || result.reachedSeq < untilSeq;
  if (undelivered) {
    invalidateUndelivered(
      productType,
      organizationId,
      entries.map((entry) => entry.channelId),
      entries.some((entry) => entry.hasCreates),
    );
  }

  // Propagate after source data settled (fresh rows on ok, invalidated list otherwise).
  for (const entry of entries) {
    for (const propagation of entry.propagations) propagateEmbeddings(propagation);
  }

  return undelivered ? 'fallback' : 'ok';
}

/**
 * Rows of a scope the client cannot fetch one by one: the refetch mark recovers its lists, at once on screen, else when
 * opened or read by the sync service, and `recountUnseen` asks for an exact unseen recount.
 */
export function invalidateUndelivered(
  productType: ProductEntityType,
  organizationId: string,
  channelIds: (string | null)[],
  recountUnseen: boolean,
): void {
  const anyViewing = channelIds.some((channelId) => isViewingChannel(organizationId, channelId));
  cacheOps.invalidateEntityListForOrg(getEntityQueryKeys(productType), organizationId, anyViewing ? 'active' : 'none');
  if (recountUnseen) invalidateUnseenCounts(productType);
}

/** Once the read budget has reads left, the product queries on screen whose read it refused read again. */
export function refetchRefusedAfterHold(): void {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = setTimeout(
    () => {
      holdTimer = null;
      if (msUntilBudget('read', 0)) refetchRefusedAfterHold();
      else
        void queryClient.refetchQueries({
          type: 'active',
          predicate: ({ queryKey, state }) => productTypeOf(queryKey) !== undefined && isRateLimited(state.error),
        });
    },
    msUntilBudget('read', 0),
  );
}

function requeue(entry: DirtyEntry, delayMs: number): void {
  const key = entryKey(entry.productType, entry.organizationId, entry.channelId);
  const existing = dirty.get(key);
  // A newer change re-enqueued this channel view mid-flight: merge this range back into it.
  if (existing) mergeRange(existing, entry);
  else dirty.set(key, { ...entry, dueAt: Date.now() + delayMs });
  armTimer();
}

/** Widens a pending entry by another range of the same scope; the pending entry keeps its own due time. */
function mergeRange(into: DirtyEntry, from: Pick<DirtyEntry, 'afterSeq' | 'untilSeq' | 'hasCreates' | 'propagations'>): void {
  into.afterSeq = Math.min(into.afterSeq, from.afterSeq);
  into.untilSeq = Math.max(into.untilSeq, from.untilSeq);
  into.hasCreates ||= from.hasCreates;
  into.propagations.push(...from.propagations);
}

/**
 * Flush pending ranges whose scope moved onto the live tier for catch-up on open. A scope that waited to be opened and is
 * opened on the background tier, in a hidden tab or on a low read budget, reads on that tier.
 */
function promoteLiveChannels(): void {
  const now = Date.now();
  let changed = false;
  for (const entry of dirty.values()) {
    const { min } = getSyncTier(entry.organizationId, entry.channelId);
    if (now + min < entry.dueAt && (min === 0 || entry.dueAt === Number.POSITIVE_INFINITY)) {
      entry.dueAt = now + min;
      changed = true;
    }
  }
  if (changed) void flushDue();
}

function installListeners(): void {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  // Top up every scope before a hidden tab may go offline; a tab shown again reads its viewed scopes at once.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushAllNow();
    else promoteLiveChannels();
  });

  // Back online: retry what accumulated while offline.
  onlineManager.subscribe((online) => {
    if (online) armTimer();
  });

  // A mounting view puts its pending scope on the live tier; this also covers panels opened without navigation and changes that arrive just before mount.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'observerAdded' && dirty.size > 0) promoteLiveChannels();
  });

  // Navigation flushes pending scopes and route context promotes org-level scopes.
  getRouter().subscribe('onLoad', promoteLiveChannels);
}
