import { LRUCache as LRU } from 'lru-cache';

export type DisposeReason = 'set' | 'evict' | 'delete';

export interface LRUCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  /** Optional max TTL in milliseconds (items can still be evicted earlier by LRU) */
  maxTtl?: number;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/** LRU cache with prefix invalidation: at capacity it drops the least recently used entry, not the oldest. */
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
            options.onDispose?.(key, value, mappedReason);
          }
        : undefined,
    });
  }

  /** Reading a key makes it the most recently used. */
  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: T, ttl?: number): void {
    this.cache.set(key, value, { ttl });
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /** Drop every entry whose key starts with `prefix`, returning the count. */
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

  /** Remaining TTL in milliseconds, 0 when the key is absent or carries no TTL. */
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
}
