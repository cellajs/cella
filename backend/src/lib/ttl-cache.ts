import { TTLCache as BaseTTLCache } from '@isaacs/ttlcache';

export type DisposeReason = 'stale' | 'set' | 'evict' | 'delete';

export interface TTLCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  defaultTtl: number;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/** TTL cache with prefix invalidation: a timer expires entries and eviction takes the soonest-expiring one. */
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
      dispose: options.onDispose ? (value, key, reason) => options.onDispose?.(key, value, reason) : undefined,
    });
  }

  /** Returns undefined when the key is missing or expired. */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  /** Falls back to the cache's default TTL. */
  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, { ttl: ttl ?? this.defaultTtl });
  }

  /** True only while the key is unexpired. */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /** Invalidate all entries matching a key prefix, returning the number deleted. */
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

  clear(): void {
    this.cache.clear();
  }

  /** Remaining TTL in milliseconds, 0 when the key is missing or expired. */
  getRemainingTTL(key: string): number {
    return this.cache.getRemainingTTL(key);
  }

  get size(): number {
    return this.cache.size;
  }

  /** Maximum allowed entries */
  get capacity(): number {
    return this.maxSize;
  }

  get stats(): { size: number; capacity: number; utilization: number } {
    return {
      size: this.cache.size,
      capacity: this.maxSize,
      utilization: this.cache.size / this.maxSize,
    };
  }

  /** Cancel the internal timer for graceful shutdown; entries stop expiring automatically. */
  cancelTimer(): void {
    this.cache.cancelTimer();
  }
}
