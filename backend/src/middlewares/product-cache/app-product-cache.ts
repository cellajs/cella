import type { EntityType } from 'shared';
import { TTLCache } from '#/lib/ttl-cache';
import { log } from '#/utils/logger';
import { productCacheMetrics } from './metrics';

const cacheTtl = 10 * 60 * 1000;

const cacheConfig = {
  maxSize: 5000,
  defaultTtl: cacheTtl,
};

/** Enriched entity response, keyed by entity. */
type CacheValue = Record<string, unknown>;

const cache = new TTLCache<CacheValue>({
  maxSize: cacheConfig.maxSize,
  defaultTtl: cacheConfig.defaultTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      log.trace('Entity cache disposed', { key, reason });
    }
  },
});

function productKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/** Entity-keyed store of enriched detail responses; CDC invalidates by id and the next fetch re-enriches. */
export const productCache = {
  /** Called by the productCache middleware once the handler has fetched and enriched from the DB. */
  set(key: string, data: Record<string, unknown>, ttlMs?: number): void {
    cache.set(key, data, ttlMs ?? cacheConfig.defaultTtl);
  },

  get(key: string): Record<string, unknown> | undefined {
    const data = cache.get(key);

    if (data === undefined) {
      productCacheMetrics.recordMiss();
      return undefined;
    }

    productCacheMetrics.recordHit();
    return data;
  },

  invalidateProduct(entityType: EntityType, entityId: string): boolean {
    const key = productKey(entityType, entityId);
    const existed = cache.has(key);

    if (existed) {
      cache.delete(key);
      productCacheMetrics.recordInvalidation(1);
      return true;
    }

    return false;
  },

  clear(): void {
    cache.clear();
  },

  stats(): {
    cacheSize: number;
    capacity: number;
    utilization: number;
  } {
    const cacheStats = cache.stats;
    return {
      cacheSize: cacheStats.size,
      capacity: cacheStats.capacity,
      utilization: cacheStats.utilization,
    };
  },
};
