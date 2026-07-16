import type { ProductEntityType } from 'shared';
import { invalidateUnseenCounts } from '~/modules/seen/query';
import { ingestSyncedRows } from '~/modules/seen/seen-store';
import { getEntityQueryKeys, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { sourceId } from '~/query/offline/stx-utils';
import * as cacheOps from './cache-ops';
import { propagateEmbeddings } from './propagation';
import { getSyncTier, isViewingScope } from './sync-priority';
import { useSyncStore } from './sync-store';
import type { AppStreamNotification } from './types';

/**
 * Lazy sync scheduler (see .todos/SYNC_FANOUT_SOLUTION.md, Piece N).
 *
 * Every product notification — single or batch (a single is a width-1 batch) — is enqueued as a
 * dirty seq range per scope instead of fetched immediately. The fetch delay is negotiated:
 * `clamp(tier.min, hash(sourceId:scope) % syncWindow, tier.max)` — the client's eagerness tier
 * bounds the server's spread window, and the hash gives deterministic per-client jitter so a
 * fan-out burst spreads evenly instead of stampeding. Ranges for the same scope merge (they are
 * contiguous per context), so a burst becomes ONE fetch. The caught-up watermark advances only
 * after a successful fetch; the "known" watermark records what the server has mentioned even for
 * scopes that never fetch (muted).
 */

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

/** FNV-1a 32-bit: deterministic jitter — same client + scope always spreads to the same slot. */
function hashSpread(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The negotiated delay: client tier bounds the server-spread slot. */
function negotiatedDelay(tier: { min: number; max: number }, scopeKey: string, windowMs: number): number {
  const spread = windowMs > 0 ? hashSpread(`${sourceId}:${scopeKey}`) % windowMs : 0;
  return Math.min(Math.max(tier.min, spread), tier.max);
}

/** Enqueue a notified seq range for lazy fetching. Always records the known watermark. */
export function enqueueRange(input: EnqueueInput): void {
  const tier = getSyncTier(input.entityType, input.organizationId, input.channelId);
  if (tier.min === Number.POSITIVE_INFINITY) {
    // Muted/archived: record the known watermark only — fetch on open.
    useSyncStore.getState().setKnownSeq(input.channelId ?? input.organizationId, input.entityType, input.untilSeq);
    return;
  }
  enqueueWithTier(input, tier);
}

/**
 * Enqueue a catchup gap (reconnect/boot top-up). Unlike live notifications, muted scopes are
 * treated as background here: catchup is a one-shot reconciliation, and skipping muted scopes
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
  const scopeId = channelId ?? organizationId;

  // Known watermark: free, recorded even for scopes we never fetch (powers catch-up-on-open).
  store.setKnownSeq(scopeId, entityType, untilSeq);

  if (!hasEntityQueryKeys(entityType)) return;

  const caughtUp = channelId
    ? store.getChannelSeq(organizationId, channelId, entityType)
    : store.getOrgSeq(organizationId, entityType);
  if (untilSeq <= caughtUp) return; // already have this range

  // Self-heal small live gaps: anchor at caught-up+1 so a missed notification's range is
  // swept up by this flush instead of waiting for reconnect count-integrity.
  const anchoredFrom = caughtUp > 0 ? Math.min(fromSeq, caughtUp + 1) : fromSeq;

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

/** Clear all pending work. Called when catchup starts: it recomputes scope deltas itself. */
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
  await Promise.all(due.map(flushEntry));
  armTimer();
}

async function flushEntry(entry: DirtyEntry): Promise<void> {
  const { entityType, organizationId, tenantId, channelId } = entry;

  // Offline: fetching fails pointlessly; keep dirty, recheck soon. Catchup owns reconnect.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    requeue(entry, OFFLINE_RECHECK_MS);
    return;
  }

  const keys = getEntityQueryKeys(entityType);
  const seqCursor = `${entry.fromSeq},${entry.untilSeq}`;
  const result = await cacheOps.fetchRangeAndPatch(entityType, organizationId, tenantId, seqCursor, keys);

  if (result.status === 'error' && entry.attempts + 1 < MAX_FLUSH_ATTEMPTS) {
    requeue({ ...entry, attempts: entry.attempts + 1 }, RETRY_BASE_MS * 2 ** entry.attempts);
    return;
  }

  if (result.status === 'ok') {
    advanceCaughtUp(entry);
    // Unseen ledger: exact badge deltas from the fetched rows (mirrors the server predicate).
    ingestSyncedRows(entityType, channelId ?? organizationId, result.items as { id: string }[]);
  } else {
    // Overflow/unsupported/exhausted retries: hand the scope to react-query and advance the
    // watermark so the range is not re-fetched in a loop — the list refetch owns recovery.
    const refetchType = isViewingScope(organizationId, channelId) ? 'active' : 'none';
    cacheOps.invalidateEntityListForOrg(keys, organizationId, refetchType);
    advanceCaughtUp(entry);
    if (entry.hasCreates) invalidateUnseenCounts(entityType);
  }

  // Propagate after source data settled (fresh rows on ok, invalidated list otherwise).
  for (const propagation of entry.propagations) propagateEmbeddings(propagation);
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
    // A newer notification re-enqueued this scope mid-flight: merge our range back into it.
    existing.fromSeq = Math.min(existing.fromSeq, entry.fromSeq);
    existing.untilSeq = Math.max(existing.untilSeq, entry.untilSeq);
    existing.hasCreates ||= entry.hasCreates;
    existing.propagations.push(...entry.propagations);
  } else {
    dirty.set(key, { ...entry, dueAt: Date.now() + delayMs });
  }
  armTimer();
}

function installListeners(): void {
  if (listenersInstalled || typeof document === 'undefined') return;
  listenersInstalled = true;

  // Tab hiding: top everything up before the user disappears — the offline-freshness story.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void flushAllNow();
  });

  // Back online: retry what accumulated while offline.
  window.addEventListener('online', () => armTimer());

  // Navigating into a scope flushes it immediately: the page catches up on open. The router is
  // imported lazily so the scheduler does not pull the whole route tree into importers' graphs.
  void import('~/routes/router').then(({ router }) => {
    router.subscribe('onLoad', () => {
      let changed = false;
      for (const entry of dirty.values()) {
        if (
          entry.dueAt > Date.now() &&
          getSyncTier(entry.entityType, entry.organizationId, entry.channelId).min === 0
        ) {
          entry.dueAt = 0;
          changed = true;
        }
      }
      if (changed) void flushDue();
    });
  });
}
