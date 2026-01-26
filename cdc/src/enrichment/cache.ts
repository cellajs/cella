/**
 * Minimal LRU cache for CDC enrichment data.
 * Uses a simple Map-based approach with TTL and max size.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple LRU cache with TTL support.
 * Entries expire after ttlMs and cache is bounded by maxSize.
 */
export class LruCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(options: { maxSize: number; ttlMs: number }) {
    this.maxSize = options.maxSize;
    this.ttlMs = options.ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end for LRU behavior
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T): void {
    // Remove if already exists (for LRU ordering)
    this.cache.delete(key);

    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/** Cache for user info (30 second TTL, max 500 entries) */
export const userCache = new LruCache<{
  id: string;
  name: string | null;
  email: string;
  thumbnailUrl: string | null;
}>({
  maxSize: 500,
  ttlMs: 30_000,
});

/** Cache for entity info (30 second TTL, max 500 entries) */
export const entityCache = new LruCache<{
  id: string;
  name: string;
  slug: string;
  thumbnailUrl: string | null;
  entityType: string;
}>({
  maxSize: 500,
  ttlMs: 30_000,
});
