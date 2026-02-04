/**
 * Simple LRU cache for public pages.
 *
 * Unlike the token-based entityCache, this cache uses page ID as the key
 * directly. It's simpler because pages are public and don't need the
 * CDC reservation flow.
 *
 * Flow:
 * 1. getPage checks cache by ID
 * 2. On miss: fetch from DB, cache result
 * 3. On page change: ActivityBus event invalidates cache entry
 */

import type { PageModel } from '#/db/schema/pages';
import { EntityTTLCache } from './ttl-cache';

/** Cache configuration */
const cacheConfig = {
  /** Max entries in cache */
  maxSize: 1000,
  /** Default TTL: 10 minutes */
  defaultTtl: 10 * 60 * 1000,
};

/** Main cache: pageId → page data */
const cache = new EntityTTLCache<PageModel>({
  maxSize: cacheConfig.maxSize,
  defaultTtl: cacheConfig.defaultTtl,
  onDispose: (key, _value, reason) => {
    if (reason === 'stale' || reason === 'evict') {
      console.debug('[pageCache] DISPOSE', { pageId: key, reason });
    }
  },
});

/**
 * Page cache service.
 * Simple ID-based cache for public pages.
 */
export const pageCache = {
  /**
   * Get page from cache by ID.
   *
   * @param id - Page ID
   * @returns Page data or undefined if not cached
   */
  get(id: string): PageModel | undefined {
    return cache.get(id);
  },

  /**
   * Set page in cache.
   *
   * @param id - Page ID
   * @param page - Page data
   * @param ttlMs - Optional TTL in ms
   */
  set(id: string, page: PageModel, ttlMs?: number): void {
    cache.set(id, page, ttlMs ?? cacheConfig.defaultTtl);
  },

  /**
   * Delete page from cache.
   * Called on page create/update/delete events.
   *
   * @param id - Page ID
   * @returns true if entry was found and removed
   */
  delete(id: string): boolean {
    return cache.delete(id);
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
