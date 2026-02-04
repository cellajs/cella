/**
 * Entity cache service - simple key-value store with TTL.
 *
 * Cache token (nanoid) is the key, entity data is the value.
 * Empty value (null) means reserved but not enriched yet.
 * Index maps entityType:entityId → token for delete lookups.
 *
 * Flow:
 * 1. CDC reserves token with null value
 * 2. First user fetch enriches: handler sets actual data
 * 3. Subsequent users get cache hit
 */

import { publicCacheMetrics } from '#/lib/cache-metrics';
import { coalesce, isInFlight } from '#/lib/request-coalescing';
import { TTLCache } from '#/lib/ttl-cache';

/** Cache TTL: 10 minutes */
const cacheTtl = 10 * 60 * 1000;

/** Cache configuration */
const cacheConfig = {
  /** Max entries in cache */
  maxSize: 5000,
  /** Default TTL: 10 minutes */
  defaultTtl: cacheTtl,
};

/** Entity data type - null means reserved but not enriched */
type CacheValue = Record<string, unknown> | null;

/** Main cache: token → entity data (or null if reserved) */
const cache = new TTLCache<CacheValue>({
  maxSize: cacheConfig.maxSize,
  defaultTtl: cacheConfig.defaultTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      console.debug('[cache] DISPOSE', { key: key.slice(0, 8), reason });
      // Also remove from index when cache entry is disposed
      for (const [indexKey, token] of entityIndex.entries()) {
        if (token === key) {
          entityIndex.delete(indexKey);
          break;
        }
      }
    }
  },
});

/** Index: entityType:entityId → token (for delete lookups) */
const entityIndex = new Map<string, string>();

/** Build index key */
function indexKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Entity cache service.
 * Simple token → data store with reserve/set/get semantics.
 */
export const entityCache = {
  /**
   * Reserve a cache slot for an entity.
   * Called by CDC when entity changes. Sets null value with index.
   *
   * @param token - Cache token (nanoid)
   * @param entityType - Entity type for index
   * @param entityId - Entity ID for index
   * @param ttlMs - Optional TTL in ms (defaults to cacheTokenTtl)
   */
  reserve(token: string, entityType: string, entityId: string, ttlMs?: number): void {
    const key = indexKey(entityType, entityId);

    // Remove old token from cache if exists
    const oldToken = entityIndex.get(key);
    if (oldToken && oldToken !== token) {
      cache.delete(oldToken);
    }

    // Set new token with null value (reserved, not enriched)
    cache.set(token, null, ttlMs ?? cacheConfig.defaultTtl);
    entityIndex.set(key, token);
  },

  /**
   * Set enriched entity data in cache.
   * Called by handler after fetching and enriching from DB.
   *
   * @param token - Cache token
   * @param data - Enriched entity data
   * @param ttlMs - Optional TTL in ms
   */
  set(token: string, data: Record<string, unknown>, ttlMs?: number): void {
    cache.set(token, data, ttlMs ?? cacheConfig.defaultTtl);
  },

  /**
   * Get entity data from cache.
   * Returns undefined if token not found.
   * Returns null if reserved but not enriched.
   * Returns data if enriched.
   *
   * @param token - Cache token
   * @returns Entity data, null (reserved), or undefined (not found)
   */
  get(token: string): Record<string, unknown> | null | undefined {
    const data = cache.get(token);

    if (data === undefined) {
      publicCacheMetrics.recordMiss();
      return undefined;
    }

    if (data === null) {
      // Reserved but not enriched - treat as miss for metrics
      publicCacheMetrics.recordMiss();
      return null;
    }

    publicCacheMetrics.recordHit();
    return data;
  },

  /**
   * Check if cache entry is enriched (has actual data, not just reserved).
   * Uses presence of 'id' field as enrichment indicator.
   *
   * @param token - Cache token
   * @returns true if enriched, false if reserved/missing
   */
  isEnriched(token: string): boolean {
    const data = cache.get(token);
    return data !== undefined && data !== null && 'id' in data;
  },

  /**
   * Invalidate cache entry by entity type and ID.
   * Uses index to find token, removes both cache entry and index.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns true if entry was found and removed
   */
  invalidateByEntity(entityType: string, entityId: string): boolean {
    const key = indexKey(entityType, entityId);
    const token = entityIndex.get(key);

    if (token) {
      cache.delete(token);
      entityIndex.delete(key);
      publicCacheMetrics.recordInvalidation(1);
      return true;
    }

    return false;
  },

  /**
   * Get token for an entity if cached.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns Token if found, undefined otherwise
   */
  getToken(entityType: string, entityId: string): string | undefined {
    return entityIndex.get(indexKey(entityType, entityId));
  },

  /**
   * Clear all cache entries and index.
   */
  clear(): void {
    cache.clear();
    entityIndex.clear();
  },

  /**
   * Fetch with coalescing: prevents thundering herd on cache miss.
   * Concurrent requests for same token share a single fetch.
   *
   * @param token - Cache token
   * @param fetcher - Async function to fetch and enrich data
   * @returns The fetched/cached data or null
   */
  async fetchWithCoalescing(
    token: string,
    fetcher: () => Promise<Record<string, unknown> | null>,
  ): Promise<Record<string, unknown> | null> {
    // Check cache first
    const cached = this.get(token);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    // Track if this was coalesced
    const wasInFlight = isInFlight(token);

    const data = await coalesce(token, fetcher);

    if (wasInFlight) {
      publicCacheMetrics.recordCoalesced();
    }

    // Cache the result if fetched successfully
    if (data) {
      this.set(token, data);
    }

    return data;
  },

  /**
   * Get cache statistics.
   */
  stats(): {
    cacheSize: number;
    indexSize: number;
    capacity: number;
    utilization: number;
  } {
    const cacheStats = cache.stats;
    return {
      cacheSize: cacheStats.size,
      indexSize: entityIndex.size,
      capacity: cacheStats.capacity,
      utilization: cacheStats.utilization,
    };
  },
};
