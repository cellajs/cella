import { TTLCache as BaseTTLCache } from '@isaacs/ttlcache';
import { coalesce } from '#/utils/request-coalescing';

export type DisposeReason = 'stale' | 'set' | 'evict' | 'delete';

export interface TTLCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  defaultTtl: number;
  /** Optional callback when an entry is stored, after the entry it replaces was disposed */
  onSet?: (key: string, value: T) => void;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/** Caches created so far: each one's number keeps its reads in flight apart from every other cache's. */
let cacheCount = 0;

/** TTL cache with prefix invalidation: a timer expires entries and eviction takes the soonest-expiring one. */
export class TTLCache<T> {
  private cache: BaseTTLCache<string, T>;
  private readonly maxSize: number;
  private readonly defaultTtl: number;
  private readonly onSet?: (key: string, value: T) => void;
  private readonly flightScope = `ttl-cache:${cacheCount++}`;
  /** Counts invalidations: a read that started under an earlier count stores nothing. */
  private generation = 0;

  constructor(options: TTLCacheOptions<T>) {
    this.maxSize = options.maxSize;
    this.defaultTtl = options.defaultTtl;
    this.onSet = options.onSet;

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
    this.onSet?.(key, value);
  }

  /**
   * The cached value, or else the one `read` resolves. Callers that arrive while a read of the key runs share it. A
   * read stores its value only when nothing was invalidated since it started, and a caller arriving after an
   * invalidation starts a read of its own, so no value read before a change is cached or handed out after it. A read
   * that rejects, or resolves undefined, stores nothing: the next caller reads again.
   * @param key - The cache key.
   * @param read - Reads the value at its source; undefined for a value that does not exist.
   * @returns The cached or read value; a rejected read rejects for every caller sharing it.
   */
  load(key: string, read: () => Promise<T>): Promise<T>;
  load(key: string, read: () => Promise<T | undefined>): Promise<T | undefined>;
  async load(key: string, read: () => Promise<T | undefined>): Promise<T | undefined> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const generation = this.generation;
    return coalesce(`${this.flightScope}:${generation}:${key}`, async () => {
      const value = await read();
      if (value !== undefined && generation === this.generation) this.set(key, value);
      return value;
    });
  }

  /**
   * Keeps every read in flight from storing its value; `delete`, `invalidateWhere` and `clear` do so too, whether or
   * not an entry matched. For a change whose entries an index outside the cache finds, where a read in flight has none.
   */
  discardPendingLoads(): void {
    this.generation++;
  }

  /** True only while the key is unexpired. */
  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    this.generation++;
    return this.cache.delete(key);
  }

  /** Invalidate all entries matching a key prefix, returning the number deleted. */
  invalidateByPrefix(prefix: string): number {
    return this.invalidateWhere((_, key) => key.startsWith(prefix));
  }

  /** Invalidate every entry the predicate picks, returning the number deleted. */
  invalidateWhere(predicate: (value: T, key: string) => boolean): number {
    this.generation++;
    let deleted = 0;
    for (const [key, value] of this.cache.entries()) {
      if (predicate(value, key)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.generation++;
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
    return { size: this.cache.size, capacity: this.maxSize, utilization: this.cache.size / this.maxSize };
  }

  /** Cancel the internal timer for graceful shutdown; entries stop expiring automatically. */
  cancelTimer(): void {
    this.cache.cancelTimer();
  }
}
