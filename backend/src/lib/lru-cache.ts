/**
 * LRU (Least Recently Used) cache with TTL support.
 * Uses Map's insertion order for O(1) eviction of oldest entries.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface LRUCacheOptions {
  /** Maximum number of entries */
  maxSize: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
}

/**
 * Generic LRU cache with time-based expiration.
 * Thread-safe for single-threaded Node.js environment.
 */
export class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTtl: number;

  constructor(options: LRUCacheOptions) {
    this.maxSize = options.maxSize;
    this.defaultTtl = options.defaultTtl;
  }

  /**
   * Get value by key. Returns undefined if not found or expired.
   * Moves entry to end (most recently used) on access.
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set value with optional custom TTL.
   * Evicts oldest entry if at capacity.
   */
  set(key: string, value: T, ttl?: number): void {
    // Delete existing to update position
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttl ?? this.defaultTtl),
    });
  }

  /**
   * Check if key exists and is not expired.
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
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
   * Remove all expired entries.
   * Call periodically to free memory.
   * @returns Number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /** Current number of entries (including expired) */
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
