import { TTLCache } from '#/lib/ttl-cache';

interface PointsEntry {
  /** Local truth: last known DB count plus every fast-path consume since. */
  consumed: number;
  /** Portion of `consumed` that has been written to the DB. */
  flushed: number;
  /** When the window this entry counts ends. The key's database row ends with it: see {@link windowSecondsLeft}. */
  windowEnd: number;
}

/** Fraction of budget below which requests skip the DB entirely. */
const fastPathThreshold = 0.8;

/** Capacity: one entry per limiter and key. Every write renews the TTL, so eviction drops the least recently written. */
const maxEntries = 50_000;

/** The longest window a limiter may count in process: an entry is kept this long after its last write. */
export const maxWindowMs = 60 * 60 * 1000;

const pointsCache = new TTLCache<PointsEntry>({ maxSize: maxEntries, defaultTtl: maxWindowMs });

/**
 * Local consumption accrues as debt settled by `takeDebt`, so each process reaches the threshold before its first flush.
 * @param windowMs - The limiter's counting window, which a key's first consume starts.
 * @returns Whether to allow locally or check the database.
 */
export function tryFastConsume(key: string, cost: number, budget: number, windowMs: number): 'allow' | 'check-db' {
  const now = Date.now();
  const entry = pointsCache.get(key);

  const isFresh = !entry || now >= entry.windowEnd;
  const priorConsumed = isFresh ? 0 : entry.consumed;

  // At or above the threshold goes to the DB, including a first request whose own cost already exceeds it
  if (priorConsumed + cost >= budget * fastPathThreshold) return 'check-db';

  if (isFresh) {
    pointsCache.set(key, { consumed: cost, flushed: 0, windowEnd: now + windowMs });
  } else {
    entry.consumed = priorConsumed + cost;
    pointsCache.set(key, entry);
  }
  return 'allow';
}

/** Claims the unflushed consumes and marks them flushed; on a DB failure other than a 429 call {@link restoreDebt}. */
export function takeDebt(key: string): number {
  const entry = pointsCache.get(key);
  if (!entry) return 0;
  const debt = Math.max(0, entry.consumed - entry.flushed);
  entry.flushed = entry.consumed;
  pointsCache.set(key, entry);
  return debt;
}

/** Returns debt that {@link takeDebt} claimed for a database consume that failed, so a later request settles it. */
export function restoreDebt(key: string, debt: number): void {
  if (debt <= 0) return;
  const entry = pointsCache.get(key);
  if (!entry) return;
  entry.flushed = Math.max(0, entry.flushed - debt);
  pointsCache.set(key, entry);
}

/**
 * Seconds left in the window the key counts in process, the whole window for a key with no live count. The key's
 * database row opens with this time, so the row and the in-process count restart together: a row with a window of its
 * own would still hold the spent budget when the in-process count restarts, or lose it while that count goes on.
 */
export function windowSecondsLeft(key: string, windowMs: number): number {
  const now = Date.now();
  const entry = pointsCache.get(key);
  return Math.ceil((entry && now < entry.windowEnd ? entry.windowEnd - now : windowMs) / 1000);
}

/**
 * Adopts the database count after a consume, accepted or rejected. The count is shared by all processes, and so is the
 * time `msBeforeNext` its row or the block on it has left: the in-process window ends with it.
 */
export function adoptDbCount(key: string, consumedPoints: number, msBeforeNext: number, windowMs: number): void {
  const now = Date.now();
  const entry = pointsCache.get(key);
  // A store that reports no time left leaves the entry its own window
  const ownEnd = entry && now < entry.windowEnd ? entry.windowEnd : now + windowMs;
  const windowEnd = msBeforeNext > 0 ? now + msBeforeNext : ownEnd;
  // A block longer than an hour keeps its entry until it ends
  pointsCache.set(key, { consumed: consumedPoints, flushed: consumedPoints, windowEnd }, Math.max(maxWindowMs, Math.ceil(windowEnd - now)));
}

/** Drops every in-process count: what a test does to start from an empty window. */
export function clearPointsCache(): void {
  pointsCache.clear();
}
