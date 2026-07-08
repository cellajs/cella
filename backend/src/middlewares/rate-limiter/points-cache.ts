import { LRUCache } from '#/lib/lru-cache';

interface PointsEntry {
  consumed: number;
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
 * @returns `'allow'` if the request can proceed without DB,
 *          `'check-db'` if the DB path should be used
 */
export function tryFastConsume(key: string, cost: number, budget: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = cache.get(key);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    cache.set(key, { consumed: cost, windowStart: now });
    return 'allow';
  }

  const projectedTotal = entry.consumed + cost;

  if (projectedTotal < budget * FAST_PATH_THRESHOLD) {
    entry.consumed = projectedTotal;
    cache.set(key, entry);
    return 'allow';
  }

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

/** Exposed for testing. */
export function clearCache(): void {
  cache.clear();
}
