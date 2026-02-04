/**
 * LRU cache with prefix invalidation support.
 * Wraps the lru-cache package for least-recently-used eviction.
 *
 * Best suited for frequently accessed items that should stay cached,
 * with eviction based on access patterns rather than time.
 */

import { LRUCache as LRU } from 'lru-cache';

/** Dispose reason */
export type DisposeReason = 'set' | 'evict' | 'delete';

export interface LRUCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  /** Optional max TTL in milliseconds (items can still be evicted earlier by LRU) */
  maxTtl?: number;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/**
 * LRU cache with prefix invalidation.
 * Evicts least recently used items when capacity is reached.
 */
export class LRUCache<T extends {}> {
  private cache: LRU<string, T>;
  private readonly maxSize: number;

  constructor(options: LRUCacheOptions<T>) {
    this.maxSize = options.maxSize;

    this.cache = new LRU<string, T>({
      max: options.maxSize,
      ttl: options.maxTtl,
      dispose: options.onDispose
        ? (value, key, reason) => {
            const mappedReason: DisposeReason = reason === 'set' ? 'set' : reason === 'evict' ? 'evict' : 'delete';
            options.onDispose!(key, value, mappedReason);
          }
        : undefined,
    });
  }

  /**
   * Get value by key. Updates recency for LRU.
   */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /**
   * Set value with optional custom TTL.
   */
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, { ttl });
  }

  /**
   * Check if key exists.
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a specific key.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching a key prefix.
   * @returns Number of entries deleted
   */
  invalidateByPrefix(prefix: string): number {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Clear all entries.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get remaining TTL for a key in milliseconds.
   * Returns 0 if key is not found or has no TTL.
   */
  getRemainingTTL(key: string): number {
    return this.cache.getRemainingTTL(key);
  }

  /** Current number of entries */
  get size(): number {
    return this.cache.size;
  }

  /** Maximum allowed entries */
  get capacity(): number {
    return this.maxSize;
  }

  /** Cache statistics */
  get stats(): { size: number; capacity: number; utilization: number } {
    return {
      size: this.cache.size,
      capacity: this.maxSize,
      utilization: this.cache.size / this.maxSize,
    };
  }
}
