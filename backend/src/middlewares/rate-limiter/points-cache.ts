import { LRUCache } from '#/lib/lru-cache';

interface PointsEntry {
  /** Local truth: last known DB count plus every fast-path consume since. */
  consumed: number;
  /** Portion of `consumed` that has been written to the DB. */
  flushed: number;
  windowStart: number;
}

/** Fraction of budget below which requests skip the DB entirely. */
const FAST_PATH_THRESHOLD = 0.8;

/** LRU capacity: one entry per unique (tenantId:userId) key. */
const MAX_ENTRIES = 50_000;

const WINDOW_MS = 60 * 60 * 1000;

const cache = new LRUCache<PointsEntry>({
  maxSize: MAX_ENTRIES,
  maxTtl: WINDOW_MS,
});

/**
 * Local consumption accrues as debt settled by `takeDebt`, so each process reaches the threshold before its first flush.
 * @returns Whether to allow locally or check the database.
 */
export function tryFastConsume(key: string, cost: number, budget: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = cache.get(key);

  const isFresh = !entry || now - entry.windowStart >= WINDOW_MS;
  const priorConsumed = isFresh ? 0 : entry.consumed;

  // At or above the threshold goes to the DB, including a first request whose own cost already exceeds it
  if (priorConsumed + cost >= budget * FAST_PATH_THRESHOLD) return 'check-db';

  if (isFresh) {
    cache.set(key, { consumed: cost, flushed: 0, windowStart: now });
  } else {
    entry.consumed = priorConsumed + cost;
    cache.set(key, entry);
  }
  return 'allow';
}

/** Claims the unflushed consumes and marks them flushed; on a DB failure other than a 429 call {@link restoreDebt}. */
export function takeDebt(key: string): number {
  const entry = cache.get(key);
  if (!entry) return 0;
  const debt = Math.max(0, entry.consumed - entry.flushed);
  entry.flushed = entry.consumed;
  cache.set(key, entry);
  return debt;
}

export function restoreDebt(key: string, debt: number): void {
  if (debt <= 0) return;
  const entry = cache.get(key);
  if (!entry) return;
  entry.flushed = Math.max(0, entry.flushed - debt);
  cache.set(key, entry);
}

/** Called after a DB consume, accepted or rejected. The DB count is authoritative across all processes. */
export function syncFromDb(key: string, consumedPoints: number): void {
  const now = Date.now();
  const entry = cache.get(key);
  const windowStart = entry ? entry.windowStart : now;
  cache.set(key, { consumed: consumedPoints, flushed: consumedPoints, windowStart });
}

export function clearCache(): void {
  cache.clear();
}
