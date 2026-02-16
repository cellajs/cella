/**
 * TTL-based cache with prefix invalidation support.
 * Wraps @isaacs/ttlcache with additional methods.
 *
 * Uses pure TTL eviction (soonest-expiring first) rather than LRU.
 */

import { TTLCache as BaseTTLCache } from '@isaacs/ttlcache';

/** Dispose reason from ttlcache */
export type DisposeReason = 'stale' | 'set' | 'evict' | 'delete';

export interface TTLCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/**
 * TTL cache with prefix invalidation.
 * Automatic expiration via timer (no manual prune needed).
 */
export class TTLCache<T> {
  private cache: BaseTTLCache<string, T>;
  private readonly maxSize: number;
  private readonly defaultTtl: number;

  constructor(options: TTLCacheOptions<T>) {
    this.maxSize = options.maxSize;
    this.defaultTtl = options.defaultTtl;

    this.cache = new BaseTTLCache<string, T>({
      max: options.maxSize,
      ttl: options.defaultTtl,
      dispose: options.onDispose ? (value, key, reason) => options.onDispose!(key, value, reason) : undefined,
    });
  }

  /**
   * Get value by key. Returns undefined if not found or expired.
   */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /**
   * Set value with optional custom TTL.
   */
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, { ttl: ttl ?? this.defaultTtl });
  }

  /**
   * Check if key exists and is not expired.
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
   * Returns 0 if key is not found or expired.
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

  /**
   * Cancel internal timer for graceful shutdown.
   * After calling this, items will not automatically expire.
   */
  cancelTimer(): void {
    this.cache.cancelTimer();
  }
}
