import type { EntityType } from 'shared';
import { TTLCache } from '#/lib/ttl-cache';
import { log } from '#/utils/logger';

const maxEntries = 5000;

/** Enriched entity response, keyed by entity. */
type CacheValue = Record<string, unknown>;

const responseCache = new TTLCache<CacheValue>({
  maxSize: maxEntries,
  defaultTtl: 10_000,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      log.trace('Entity cache disposed', { key, reason });
    }
  },
});

const productKey = (entityType: EntityType, entityId: string): string => `${entityType}:${entityId}`;

/** How long after a write no read of that row is cached: longer than the write's transaction takes to commit. */
const writeHoldMs = 5000;

/**
 * Per key, the moment before which a read may not be cached. An invalidation sets it to now: a read that was in
 * flight read the row from before the change. A write on its way to commit sets it a few seconds ahead: until the
 * commit, a read still sees the old row. Entries outlive the reads they guard and then expire.
 */
const noStoreBefore = new TTLCache<number>({ maxSize: maxEntries * 2, defaultTtl: 60_000 });

const holdOff = (key: string, until: number): void => {
  noStoreBefore.set(key, Math.max(until, noStoreBefore.get(key) ?? 0));
};

/**
 * Entity-keyed store of enriched detail responses; the API's own writes and CDC messages drop entries by id, the next
 * fetch re-enriches. A process neither reaches serves its entry for up to 10 seconds after the fill.
 */
export const productCacheStore = {
  /**
   * Called by the productCache middleware once the handler has fetched and enriched from the DB. The row is stored
   * under its own id, which every drop names, whatever spelling of the id the request used. Stores nothing when the
   * row was invalidated or written since the read started: what it read is from before that.
   * @param readStartedAt - `performance.now()` from before the handler ran.
   * @returns Whether the response was stored.
   */
  set(entityType: EntityType, row: CacheValue & { id: string }, readStartedAt: number): boolean {
    const key = productKey(entityType, row.id);
    if (readStartedAt < (noStoreBefore.get(key) ?? 0)) return false;
    responseCache.set(key, row);
    return true;
  },

  get(entityType: EntityType, entityId: string): CacheValue | undefined {
    return responseCache.get(productKey(entityType, entityId));
  },

  /** A CDC message says the row changed: its entry goes, and a read that is in flight is not stored. */
  invalidateProduct(entityType: EntityType, entityId: string): void {
    const key = productKey(entityType, entityId);
    // Also without an entry: a read in flight would store the row it read before this change.
    holdOff(key, performance.now());
    responseCache.delete(key);
  },

  /**
   * A write of these rows is on its way to commit in this process. Their entries go now, and for a few seconds no read
   * of them is cached, so the API answers a read with the row whether or not the CDC worker is there to drop the entry.
   */
  holdForWrite(entityType: EntityType, entityIds: string[]): void {
    for (const entityId of entityIds) {
      const key = productKey(entityType, entityId);
      responseCache.delete(key);
      holdOff(key, performance.now() + writeHoldMs);
    }
  },

  clear(): void {
    responseCache.clear();
    noStoreBefore.clear();
  },
};
