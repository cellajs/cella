import type { EntityType } from 'shared';
import { TTLCache } from '#/lib/ttl-cache';
import { log } from '#/utils/logger';
import { entityCacheMetrics } from './metrics';

/** Cache TTL: 10 minutes. */
const cacheTtl = 10 * 60 * 1000;

/** Cache configuration. */
const cacheConfig = {
  /** Max entries in entity cache */
  maxSize: 5000,
  /** Default TTL: 10 minutes */
  defaultTtl: cacheTtl,
};

/** Enriched entity response, keyed by entity. */
type CacheValue = Record<string, unknown>;

/** Main cache: entityKey to enriched entity data. */
const cache = new TTLCache<CacheValue>({
  maxSize: cacheConfig.maxSize,
  defaultTtl: cacheConfig.defaultTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      log.trace('Entity cache disposed', { key, reason });
    }
  },
});

/** Build entity key. */
function entityKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Entity cache service.
 * Entity-keyed store of enriched detail responses. CDC invalidates an entry by entity id on
 * change; the next fetch re-enriches. Access is authorized per request by the appCache middleware.
 */
export const entityCache = {
  /**
   * Set enriched entity data in cache.
   * Called by the appCache middleware after the handler fetches and enriches from DB.
   */
  set(key: string, data: Record<string, unknown>, ttlMs?: number): void {
    cache.set(key, data, ttlMs ?? cacheConfig.defaultTtl);
  },

  /**
   * Get entity data from cache by entity key.
   * Returns the enriched data, or undefined if not cached.
   */
  get(key: string): Record<string, unknown> | undefined {
    const data = cache.get(key);

    if (data === undefined) {
      entityCacheMetrics.recordMiss();
      return undefined;
    }

    entityCacheMetrics.recordHit();
    return data;
  },

  /**
   * Invalidate cache entry by entity type and ID.
   * Removes entity data from cache so the next fetch re-enriches.
   */
  invalidateByEntity(entityType: EntityType, entityId: string): boolean {
    const key = entityKey(entityType, entityId);
    const existed = cache.has(key);

    if (existed) {
      cache.delete(key);
      entityCacheMetrics.recordInvalidation(1);
      return true;
    }

    return false;
  },

  /**
   * Clear all cache entries.
   */
  clear(): void {
    cache.clear();
  },

  /**
   * Get cache statistics.
   */
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
