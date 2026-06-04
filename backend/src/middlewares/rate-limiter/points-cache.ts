/**
 * In-process LRU counter for points-budget rate limiting.
 *
 * Eliminates DB round-trips for clients well under their hourly budget.
 * Only the `limit` mode (pointsLimiter) uses this — auth/brute-force limiters
 * (failseries, success, fail) always go through the DB for accuracy.
 *
 * Flow:
 *   1. Check LRU counter for the key
 *   2. If consumed < threshold (default 80% of budget) → increment memory, skip DB entirely
 *   3. If consumed >= threshold or no entry → fall through to DB path, sync cache afterward
 *
 * Trade-off: in a multi-process setup, each process maintains its own counter.
 * A user could consume up to `budget × processCount` before being blocked by the DB.
 * For API budget limiters this slight over-allowance is acceptable — it's not
 * protecting against brute-force attacks, just enforcing fair-use quotas.
 */

import { LRUCache } from '#/lib/lru-cache';

interface PointsEntry {
  consumed: number;
  windowStart: number;
}

/** Fraction of budget below which requests skip the DB entirely */
const FAST_PATH_THRESHOLD = 0.8;

/** LRU capacity: one entry per unique (tenantId:userId) key */
const MAX_ENTRIES = 50_000;

/** Rate limit window duration in ms (1 hour) */
const WINDOW_MS = 60 * 60 * 1000;

const cache = new LRUCache<PointsEntry>({
  maxSize: MAX_ENTRIES,
  maxTtl: WINDOW_MS,
});

/**
 * Try the in-memory fast path for a points-budget key.
 *
 * @returns `'allow'` if the request can proceed without DB,
 *          `'check-db'` if the DB path should be used
 */
export function tryFastConsume(key: string, cost: number, budget: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = cache.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // New window — start fresh
    cache.set(key, { consumed: cost, windowStart: now });
    return 'allow';
  }

  const projectedTotal = entry.consumed + cost;

  if (projectedTotal < budget * FAST_PATH_THRESHOLD) {
    entry.consumed = projectedTotal;
    cache.set(key, entry);
    return 'allow';
  }

  // Near or over budget — let the DB path handle it for accuracy
  return 'check-db';
}

/**
 * Sync the cache after a successful DB consume.
 * Called when the DB path is taken so the cache reflects the authoritative count.
 */
export function syncFromDb(key: string, consumedPoints: number): void {
  const now = Date.now();
  const entry = cache.get(key);
  const windowStart = entry ? entry.windowStart : now;
  cache.set(key, { consumed: consumedPoints, windowStart });
}

/** Exposed for testing */
export function clearCache(): void {
  cache.clear();
}
