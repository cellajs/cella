import type { EntityType } from 'shared';
import { TTLCache } from '#/lib/ttl-cache';
import { log } from '#/utils/logger';
import { coalesce, isInFlight } from '#/utils/request-coalescing';
import { entityCacheMetrics } from './metrics';

/** Cache TTL: 10 minutes. */
const cacheTtl = 10 * 60 * 1000;

/** Cache configuration. */
const cacheConfig = {
  /** Max entries in entity cache */
  maxSize: 5000,
  /** Max entries in token index (tokens per entity accumulate between edits) */
  tokenIndexMaxSize: 10000,
  /** Default TTL: 10 minutes */
  defaultTtl: cacheTtl,
};

/** Entity data type. Null means reserved but not enriched. */
type CacheValue = Record<string, unknown> | null;

/** Main cache: entityKey to entity data, or null if reserved. */
const cache = new TTLCache<CacheValue>({
  maxSize: cacheConfig.maxSize,
  defaultTtl: cacheConfig.defaultTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      log.trace('Entity cache disposed', { key, reason });
    }
  },
});

/** Token index: token to entityKey (forward-only: old tokens still resolve). */
const tokenIndex = new TTLCache<string>({
  maxSize: cacheConfig.tokenIndexMaxSize,
  defaultTtl: cacheConfig.defaultTtl,
});

/** Build entity key. */
function entityKey(entityType: EntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Entity cache service.
 * Entity-keyed store with token resolution. Forward-only: old tokens
 * resolve to the same entity key, avoiding duplicate cache entries.
 */
export const entityCache = {
  /**
   * Reserve a cache slot for an entity.
   * Called by CDC when entity changes. Maps token to entity key
   * and invalidates stale cached data so next fetch goes to DB.
   * Old tokens for the same entity remain valid (forward-only).
   *
   * @param token - Cache token (nanoid from CDC)
   */
  reserve(token: string, entityType: EntityType, entityId: string, ttlMs?: number): void {
    const key = entityKey(entityType, entityId);
    const ttl = ttlMs ?? cacheConfig.defaultTtl;

    tokenIndex.set(token, key, ttl);

    // Mark as reserved so the next fetch refreshes stale data.
    cache.set(key, null, ttl);
  },

  /**
   * Resolve a token to its entity key.
   * Works for both current and old tokens (forward-only).
   * Returns undefined if the token is unknown or expired.
   */
  resolveToken(token: string): string | undefined {
    return tokenIndex.get(token);
  },

  /**
   * Set enriched entity data in cache.
   * Called by handler after fetching and enriching from DB.
   */
  set(key: string, data: Record<string, unknown>, ttlMs?: number): void {
    cache.set(key, data, ttlMs ?? cacheConfig.defaultTtl);
  },

  /**
   * Get entity data from cache by entity key.
   * Returns undefined if not found.
   * Returns null if reserved but not enriched.
   * Returns data if enriched.
   */
  get(key: string): Record<string, unknown> | null | undefined {
    const data = cache.get(key);

    if (data === undefined) {
      entityCacheMetrics.recordMiss();
      return undefined;
    }

    if (data === null) {
      // Reserved but not enriched - treat as miss for metrics
      entityCacheMetrics.recordMiss();
      return null;
    }

    entityCacheMetrics.recordHit();
    return data;
  },

  /**
   * Check if cache entry is enriched (has actual data, not just reserved).
   * Uses presence of 'id' field as enrichment indicator.
   */
  isEnriched(key: string): boolean {
    const data = cache.get(key);
    return data !== undefined && data !== null && 'id' in data;
  },

  /**
   * Invalidate cache entry by entity type and ID.
   * Removes entity data from cache. Token index entries expire naturally.
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
   * Clear all cache entries and token index.
   */
  clear(): void {
    cache.clear();
    tokenIndex.clear();
  },

  /**
   * Fetch with coalescing: prevents thundering herd on cache miss.
   * Coalesces by entity key, so different tokens for the same entity
   * share a single in-flight fetch.
   */
  async fetchWithCoalescing(
    key: string,
    fetcher: () => Promise<Record<string, unknown> | null>,
  ): Promise<Record<string, unknown> | null> {
    // Check cache first
    const cached = this.get(key);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    // Track if this was coalesced
    const wasInFlight = isInFlight(key);

    const data = await coalesce(key, fetcher);

    if (wasInFlight) {
      entityCacheMetrics.recordCoalesced();
    }

    // Cache the result if fetched successfully
    if (data) {
      this.set(key, data);
    }

    return data;
  },

  /**
   * Get cache statistics.
   */
  stats(): {
    cacheSize: number;
    tokenIndexSize: number;
    capacity: number;
    utilization: number;
  } {
    const cacheStats = cache.stats;
    return {
      cacheSize: cacheStats.size,
      tokenIndexSize: tokenIndex.size,
      capacity: cacheStats.capacity,
      utilization: cacheStats.utilization,
    };
  },
};
