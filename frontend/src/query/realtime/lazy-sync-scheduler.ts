import type { ProductEntityType } from 'shared';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { ingestSyncedRows } from '~/modules/seen/unseen-sync';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';
import * as cacheOps from './cache-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncTier, isViewingChannel } from './sync-priority';
import { useSyncStore } from './sync-store';
import type { AppStreamNotification } from './types';
import { resolveChannelPath } from './view-declaration';

/** Fixed spread window until the server negotiates one per notification (Piece N-c). */
const DEFAULT_SYNC_WINDOW_MS = 15_000;
/** Transient fetch errors retry with exponential backoff before falling back to invalidation. */
const MAX_FLUSH_ATTEMPTS = 3;
const RETRY_BASE_MS = 2_000;
/** Re-check delay while offline (fetching would fail pointlessly; catchup owns reconnect). */
const OFFLINE_RECHECK_MS = 5_000;

export interface EnqueueInput {
  entityType: ProductEntityType;
  organizationId: string;
  tenantId: string | null;
  channelId: string | null;
  fromSeq: number;
  untilSeq: number;
  isCreate: boolean;
  syncWindowMs?: number;
  propagation?: AppStreamNotification['propagation'];
}

interface DirtyEntry {
  entityType: ProductEntityType;
  organizationId: string;
  tenantId: string | null;
  channelId: string | null;
  fromSeq: number;
  untilSeq: number;
  dueAt: number;
  hasCreates: boolean;
  attempts: number;
  propagations: NonNullable<AppStreamNotification['propagation']>[];
}

const dirty = new Map<string, DirtyEntry>();
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

const entryKey = (entityType: string, organizationId: string, channelId: string | null) =>
  `${entityType}:${channelId ?? organizationId}`;

/** FNV-1a 32-bit gives the same client and scope a stable spread slot. */
function hashSpread(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The negotiated delay: client tier bounds the server-spread slot. */
function negotiatedDelay(tier: { min: number; max: number }, channelViewKey: string, windowMs: number): number {
  const spread = windowMs > 0 ? hashSpread(`${sourceId}:${channelViewKey}`) % windowMs : 0;
  return Math.min(Math.max(tier.min, spread), tier.max);
}

/** Enqueue a notified seq range for lazy fetching. Always records the known watermark. */
export function enqueueRange(input: EnqueueInput): void {
  const tier = getSyncTier(input.entityType, input.organizationId, input.channelId);
  if (tier.min === Number.POSITIVE_INFINITY) {
    // Muted and archived scopes record the known watermark and fetch when opened.
    useSyncStore.getState().setKnownSeq(input.channelId ?? input.organizationId, input.entityType, input.untilSeq);
    return;
  }
  enqueueWithTier(input, tier);
}

/**
 * Enqueue a catchup gap (reconnect/boot top-up). Unlike live notifications, muted channel views are
 * treated as background here: catchup is a one-shot reconciliation, and skipping muted channel views
 * would leave their persisted caches stale forever (nothing else refetches them). The
 * background spread also de-stampedes the reconnect herd.
 */
export function enqueueCatchupRange(input: EnqueueInput): void {
  const tier = getSyncTier(input.entityType, input.organizationId, input.channelId);
  enqueueWithTier(input, tier.min === Number.POSITIVE_INFINITY ? { min: 2_000, max: 30_000 } : tier);
}

function enqueueWithTier(input: EnqueueInput, tier: { min: number; max: number }): void {
  const { entityType, organizationId, tenantId, channelId, fromSeq, untilSeq, isCreate, propagation } = input;
  const store = useSyncStore.getState();
  const channelViewId = channelId ?? organizationId;

  // Known watermark: free, recorded even for scopes we never fetch (powers catch-up-on-open).
  store.setKnownSeq(channelViewId, entityType, untilSeq);

  if (!hasEntityQueryKeys(entityType)) return;

  const caughtUp = channelId
    ? store.getChannelSeq(organizationId, channelId, entityType)
    : store.getOrgSeq(organizationId, entityType);
  if (untilSeq <= caughtUp) return; // already have this range

  // Anchor at caught-up+1: heals missed-notification gaps (fromSeq above the watermark) and
  // trims already-ingested overlap (fromSeq below it, e.g. a range catchup partly covered).
  // Without a baseline (caughtUp 0) trust the notification's own range.
  const anchoredFrom = caughtUp > 0 ? caughtUp + 1 : fromSeq;

  const key = entryKey(entityType, organizationId, channelId);
  const dueAt = Date.now() + negotiatedDelay(tier, key, input.syncWindowMs ?? DEFAULT_SYNC_WINDOW_MS);

  const existing = dirty.get(key);
  if (existing) {
    existing.fromSeq = Math.min(existing.fromSeq, anchoredFrom);
    existing.untilSeq = Math.max(existing.untilSeq, untilSeq);
    existing.dueAt = Math.min(existing.dueAt, dueAt); // more news never postpones
    existing.hasCreates ||= isCreate;
    if (propagation) existing.propagations.push(propagation);
  } else {
    dirty.set(key, {
      entityType,
      organizationId,
      tenantId,
      channelId,
      fromSeq: anchoredFrom,
      untilSeq,
      dueAt,
      hasCreates: isCreate,
      attempts: 0,
      propagations: propagation ? [propagation] : [],
    });
  }

  installListeners();
  armTimer();
}

/** Flush every dirty scope now (tab hiding, tests). */
export function flushAllNow(): Promise<void> {
  for (const entry of dirty.values()) entry.dueAt = 0;
  return flushDue();
}

/**
 * Awaitable immediate flush of ONE channel view, the foreground catchup path (gap 4a):
 * catchup enqueues its gap, then awaits this so the mutation-replay gate resolves against a
 * reconciled cache, while the scheduler stays the only code that fetches seq ranges.
 * Single attempt: a failure takes the fallback (invalidate + advance), not the lazy
 * retry ladder, mirroring catchup's original inline semantics.
 */
export async function flushChannelViewNow(
  entityType: ProductEntityType,
  organizationId: string,
  channelId: string | null,
): Promise<'ok' | 'fallback' | 'requeued' | 'none'> {
  const entry = dirty.get(entryKey(entityType, organizationId, channelId));
  if (!entry) return 'none';
  dirty.delete(entryKey(entityType, organizationId, channelId));
  return flushGroup([{ ...entry, attempts: MAX_FLUSH_ATTEMPTS - 1 }]);
}

/** Clear all pending work. Called when catchup starts: it recomputes channel-view deltas itself. */
export function resetLazySync(): void {
  dirty.clear();
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

function armTimer(): void {
  if (dirty.size === 0) return;
  let earliest = Number.POSITIVE_INFINITY;
  for (const entry of dirty.values()) earliest = Math.min(earliest, entry.dueAt);

  const delay = Math.max(0, earliest - Date.now());
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void flushDue();
  }, delay);
}

async function flushDue(): Promise<void> {
  const now = Date.now();
  const due: DirtyEntry[] = [];
  for (const [key, entry] of dirty) {
    if (entry.dueAt > now) continue;
    dirty.delete(key); // in-flight ranges leave the map; overlapping re-notifications re-enqueue
    due.push(entry);
  }
  // Covering fetch: every due channel of one (entityType, org) shares ONE bounded fetch;
  // rows route to their home lists during patching, so N dirty channels never cost N fetches.
  const groups = new Map<string, DirtyEntry[]>();
  for (const entry of due) {
    const groupKey = `${entry.entityType}:${entry.organizationId}`;
    const group = groups.get(groupKey);
    if (group) group.push(entry);
    else groups.set(groupKey, [entry]);
  }
  await Promise.all([...groups.values()].map(flushGroup));
  armTimer();
}

/**
 * Narrowest path prefix covering every due channel of a group; undefined = whole org (no
 * narrowing). Paths come from the fork-registered channel-path resolver; any org-level entry
 * or unresolvable channel widens to the org. The template always widens (its only channel IS
 * the org), so `pathPrefix` never leaves undefined there.
 */
function coveringPathPrefix(entries: DirtyEntry[]): string | undefined {
  const paths: string[][] = [];
  for (const entry of entries) {
    if (!entry.channelId || entry.channelId === entry.organizationId) return undefined;
    const path = resolveChannelPath(null, entry.channelId);
    if (!path) return undefined;
    paths.push(path.split('/'));
  }
  let common = paths[0];
  for (const segments of paths.slice(1)) {
    let i = 0;
    while (i < common.length && i < segments.length && common[i] === segments[i]) i++;
    common = common.slice(0, i);
  }
  // A single root segment is the org id: no narrowing.
  return common.length > 1 ? common.join('/') : undefined;
}

/** Flush one covering group: fetch the merged range once, then settle every entry from it. */
async function flushGroup(entries: DirtyEntry[]): Promise<'ok' | 'fallback' | 'requeued'> {
  const { entityType, organizationId } = entries[0];
  const tenantId = entries.find((entry) => entry.tenantId)?.tenantId ?? null;

  // Offline: fetching fails pointlessly; keep dirty, recheck soon. Catchup owns reconnect.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    for (const entry of entries) requeue(entry, OFFLINE_RECHECK_MS);
    return 'requeued';
  }

  const fromSeq = Math.min(...entries.map((entry) => entry.fromSeq));
  const untilSeq = Math.max(...entries.map((entry) => entry.untilSeq));
  const keys = getEntityQueryKeys(entityType);
  const result = await cacheOps.fetchRangeAndPatch(
    entityType,
    organizationId,
    tenantId,
    `${fromSeq},${untilSeq}`,
    keys,
    coveringPathPrefix(entries),
  );

  if (result.status === 'error' && entries.some((entry) => entry.attempts + 1 < MAX_FLUSH_ATTEMPTS)) {
    for (const entry of entries)
      requeue({ ...entry, attempts: entry.attempts + 1 }, RETRY_BASE_MS * 2 ** entry.attempts);
    return 'requeued';
  }

  if (result.status === 'ok') {
    // Per-view advance accounting: the fetch covered [fromSeq, untilSeq] for every channel
    // under the covering prefix, so each due channel advances to the shared upper bound.
    for (const entry of entries) advanceCaughtUp({ ...entry, untilSeq });
    // Unseen sync: exact badge deltas from the fetched rows (each row resolves its own home
    // channel; the org id is only the fallback for rows without ancestor ids).
    ingestSyncedRows(entityType, organizationId, result.items as { id: string }[]);
  } else {
    // Overflow/unsupported/exhausted retries: hand the channel views to react-query and advance
    // the watermark to prevent a fetch loop. The list refetch owns recovery.
    const anyViewing = entries.some((entry) => isViewingChannel(organizationId, entry.channelId));
    cacheOps.invalidateEntityListForOrg(keys, organizationId, anyViewing ? 'active' : 'none');
    for (const entry of entries) advanceCaughtUp({ ...entry, untilSeq });
    if (entries.some((entry) => entry.hasCreates)) invalidateUnseenCounts(entityType);
  }

  // Propagate after source data settled (fresh rows on ok, invalidated list otherwise).
  for (const entry of entries) {
    for (const propagation of entry.propagations) propagateEmbeddings(propagation);
  }

  return result.status === 'ok' ? 'ok' : 'fallback';
}

function advanceCaughtUp(entry: DirtyEntry): void {
  const store = useSyncStore.getState();
  if (entry.channelId) {
    store.setChannelSeq(entry.organizationId, entry.channelId, entry.entityType, entry.untilSeq);
  } else {
    store.setOrgSeq(entry.organizationId, entry.entityType, entry.untilSeq);
  }
}

function requeue(entry: DirtyEntry, delayMs: number): void {
  const key = entryKey(entry.entityType, entry.organizationId, entry.channelId);
  const existing = dirty.get(key);
  if (existing) {
    // A newer notification re-enqueued this channel view mid-flight: merge our range back into it.
    existing.fromSeq = Math.min(existing.fromSeq, entry.fromSeq);
    existing.untilSeq = Math.max(existing.untilSeq, entry.untilSeq);
    existing.hasCreates ||= entry.hasCreates;
    existing.propagations.push(...entry.propagations);
  } else {
    dirty.set(key, { ...entry, dueAt: Date.now() + delayMs });
  }
  armTimer();
}

/** Flush pending ranges whose scope moved onto the live tier for catch-up on open. */
function promoteLiveChannels(): void {
  let changed = false;
  for (const entry of dirty.values()) {
    if (entry.dueAt > Date.now() && getSyncTier(entry.entityType, entry.organizationId, entry.channelId).min === 0) {
      entry.dueAt = 0;
      changed = true;
    }
  }
  if (changed) void flushDue();
}

function installListeners(): void {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  // Top up every scope before a hidden tab may go offline.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushAllNow();
  });

  // Back online: retry what accumulated while offline.
  window.addEventListener('online', () => armTimer());

  // A mounting view can put a pending scope on the live tier (its list query gains an observer):
  // same catch-up-on-open as the route subscription below, but it also covers panels opened
  // without navigation and a notification that landed moments before the view mounted.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'observerAdded' && dirty.size > 0) promoteLiveChannels();
  });

  // Navigation flushes pending scopes immediately. Route context promotes org-level scopes.
  // Import lazily to keep the route tree out of the scheduler's importer graphs.
  void import('~/routes/router').then(({ router }) => {
    router.subscribe('onLoad', () => promoteLiveChannels());
  });
}
