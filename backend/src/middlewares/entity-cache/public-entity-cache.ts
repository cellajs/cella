/**
 * Entity-agnostic LRU cache for public product entities.
 *
 * Unlike the token-based entityCache, this cache uses entityType:entityId as the key
 * directly. It's simpler because public entities don't need the CDC reservation flow
 * and are accessible without authentication.
 *
 * Flow:
 * 1. Handler checks cache by entityType + entityId
 * 2. On miss: fetch from DB, cache result
 * 3. On entity change: ActivityBus event invalidates cache entry
 *
 * Public entities are determined by hierarchy.publicActionsTypes (entities with publicActions configured).
 */

import { LRUCache } from '#/lib/lru-cache';

/** Cache configuration */
const cacheConfig = {
  /** Max entries in cache (shared across all public entity types) */
  maxSize: 1000,
  /** Optional max TTL: 1 hour (LRU eviction is primary, TTL is safety net) */
  maxTtl: 60 * 60 * 1000,
};

/**
 * Build cache key from entity type and ID.
 */
function buildKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Parse cache key back to entity type and ID.
 */
function parseKey(key: string): { entityType: string; entityId: string } | null {
  const colonIndex = key.indexOf(':');
  if (colonIndex === -1) return null;
  return {
    entityType: key.substring(0, colonIndex),
    entityId: key.substring(colonIndex + 1),
  };
}

/** Main cache: entityType:entityId → entity data */
const cache = new LRUCache<Record<string, unknown>>({
  maxSize: cacheConfig.maxSize,
  maxTtl: cacheConfig.maxTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'evict') {
      const parsed = parseKey(key);
      console.debug('[publicEntityCache] DISPOSE', { ...parsed, reason });
    }
  },
});

/**
 * Public entity cache service.
 * Simple entityType:entityId keyed cache for public product entities.
 */
export const publicEntityCache = {
  /**
   * Get entity from cache.
   *
   * @param entityType - Entity type (must be a public product entity)
   * @param entityId - Entity ID
   * @returns Entity data or undefined if not cached
   */
  get<T>(entityType: string, entityId: string): T | undefined {
    const key = buildKey(entityType, entityId);
    return cache.get(key) as T | undefined;
  },

  /**
   * Set entity in cache.
   *
   * @param entityType - Entity type (must be a public product entity)
   * @param entityId - Entity ID
   * @param entity - Entity data
   * @param ttlMs - Optional TTL in ms (overrides default)
   */
  set<T extends Record<string, unknown>>(entityType: string, entityId: string, entity: T, ttlMs?: number): void {
    const key = buildKey(entityType, entityId);
    cache.set(key, entity, ttlMs ?? cacheConfig.maxTtl);
  },

  /**
   * Delete entity from cache.
   * Called on entity create/update/delete events.
   *
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns true if entry was found and removed
   */
  delete(entityType: string, entityId: string): boolean {
    const key = buildKey(entityType, entityId);
    return cache.delete(key);
  },

  /**
   * Clear all cache entries for a specific entity type.
   *
   * @param entityType - Entity type to clear
   */
  clearByType(entityType: string): void {
    // Note: EntityTTLCache doesn't expose keys directly, so we clear all
    // This is acceptable since public entities are a small subset
    const stats = cache.stats;
    if (stats.size > 0) {
      cache.clear();
      console.debug('[publicEntityCache] Cleared all entries (type filter requested)', { entityType });
    }
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
    size: number;
    capacity: number;
    utilization: number;
  } {
    const cacheStats = cache.stats;
    return {
      size: cacheStats.size,
      capacity: cacheStats.capacity,
      utilization: cacheStats.utilization,
    };
  },
};
