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

/** Rate limit window duration in ms (1 hour). */
const WINDOW_MS = 60 * 60 * 1000;

const cache = new LRUCache<PointsEntry>({
  maxSize: MAX_ENTRIES,
  maxTtl: WINDOW_MS,
});

/**
 * Try the in-memory fast path for a points-budget key.
 * Used by `limit` mode for API budgets; brute-force limiters always use the DB.
 *
 * Fast-path consumes are not written to the DB immediately; they accrue as debt
 * (`consumed - flushed`) that {@link takeDebt} settles in bulk on the next DB trip.
 * Without that settlement the DB count stays near zero and the budget is never
 * enforced. The remaining imprecision is multi-process: each process can run
 * up to `threshold × budget` locally before its first flush.
 *
 * @returns `'allow'` if the request can proceed without DB,
 *          `'check-db'` if the DB path should be used
 */
export function tryFastConsume(key: string, cost: number, budget: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = cache.get(key);

  const isFresh = !entry || now - entry.windowStart >= WINDOW_MS;
  const priorConsumed = isFresh ? 0 : entry.consumed;

  // Everything at/above the threshold goes to the DB, including a first request
  // whose own cost is already over it (e.g. an oversized bulk body).
  if (priorConsumed + cost >= budget * FAST_PATH_THRESHOLD) return 'check-db';

  if (isFresh) {
    cache.set(key, { consumed: cost, flushed: 0, windowStart: now });
  } else {
    entry.consumed = priorConsumed + cost;
    cache.set(key, entry);
  }
  return 'allow';
}

/**
 * Claim the unflushed fast-path consumes for a key, marking them as flushed.
 * The caller must add the returned debt to its DB consume; on a failed DB write
 * (other than a rate limit rejection) call {@link restoreDebt} so it isn't lost.
 */
export function takeDebt(key: string): number {
  const entry = cache.get(key);
  if (!entry) return 0;
  const debt = Math.max(0, entry.consumed - entry.flushed);
  entry.flushed = entry.consumed;
  cache.set(key, entry);
  return debt;
}

/** Restore claimed debt after a failed DB write. */
export function restoreDebt(key: string, debt: number): void {
  if (debt <= 0) return;
  const entry = cache.get(key);
  if (!entry) return;
  entry.flushed = Math.max(0, entry.flushed - debt);
  cache.set(key, entry);
}

/**
 * Sync the cache after a DB consume (successful or rejected).
 * The DB count is authoritative: it includes our flushed debt and any
 * consumption from other processes.
 */
export function syncFromDb(key: string, consumedPoints: number): void {
  const now = Date.now();
  const entry = cache.get(key);
  const windowStart = entry ? entry.windowStart : now;
  cache.set(key, { consumed: consumedPoints, flushed: consumedPoints, windowStart });
}

/** Exposed for testing. */
export function clearCache(): void {
  cache.clear();
}
