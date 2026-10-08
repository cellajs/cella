import { TTLCache } from '#/lib/ttl-cache';

interface PointsEntry {
  /** Local truth: last known DB count plus every fast-path consume since. */
  consumed: number;
  /** Portion of `consumed` that has been written to the DB. */
  flushed: number;
  /** When the hour this entry counts ends. The key's database row ends with it: see {@link windowSecondsLeft}. */
  windowEnd: number;
}

/** Fraction of budget below which requests skip the DB entirely. */
const FAST_PATH_THRESHOLD = 0.8;

/** Capacity: one entry per limiter and key. Every write renews the TTL, so eviction drops the least recently written. */
const MAX_ENTRIES = 50_000;

const WINDOW_MS = 60 * 60 * 1000;

const cache = new TTLCache<PointsEntry>({ maxSize: MAX_ENTRIES, defaultTtl: WINDOW_MS });

/**
 * Local consumption accrues as debt settled by `takeDebt`, so each process reaches the threshold before its first flush.
 * @returns Whether to allow locally or check the database.
 */
export function tryFastConsume(key: string, cost: number, budget: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = cache.get(key);

  const isFresh = !entry || now >= entry.windowEnd;
  const priorConsumed = isFresh ? 0 : entry.consumed;

  // At or above the threshold goes to the DB, including a first request whose own cost already exceeds it
  if (priorConsumed + cost >= budget * FAST_PATH_THRESHOLD) return 'check-db';

  if (isFresh) {
    cache.set(key, { consumed: cost, flushed: 0, windowEnd: now + WINDOW_MS });
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

/**
 * Seconds left in the hour the key counts in process, the whole hour for a key with no live count. The key's database
 * row opens with this window, so the row and the in-process count restart together: a row with an hour of its own
 * would still hold the spent budget when the in-process count restarts, or lose it while that count goes on.
 */
export function windowSecondsLeft(key: string): number {
  const now = Date.now();
  const entry = cache.get(key);
  return entry && now < entry.windowEnd ? Math.ceil((entry.windowEnd - now) / 1000) : WINDOW_MS / 1000;
}

/**
 * Called after a DB consume, accepted or rejected. The DB count is authoritative across all processes, and so is the
 * time `msBeforeNext` its row or the block on it has left: the in-process hour ends with it.
 */
export function syncFromDb(key: string, consumedPoints: number, msBeforeNext: number): void {
  const now = Date.now();
  const entry = cache.get(key);
  // A store that reports no time left leaves the entry its own hour
  const ownEnd = entry && now < entry.windowEnd ? entry.windowEnd : now + WINDOW_MS;
  const windowEnd = msBeforeNext > 0 ? now + msBeforeNext : ownEnd;
  // A block longer than the hour keeps its entry until it ends
  cache.set(key, { consumed: consumedPoints, flushed: consumedPoints, windowEnd }, Math.max(WINDOW_MS, Math.ceil(windowEnd - now)));
}

export function clearCache(): void {
  cache.clear();
}
