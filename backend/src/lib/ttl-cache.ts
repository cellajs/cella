import { TTLCache as BaseTTLCache } from '@isaacs/ttlcache';
import { coalesce } from '#/utils/request-coalescing';

type DisposeReason = 'stale' | 'set' | 'evict' | 'delete';

interface TTLCacheOptions<T> {
  /** Maximum number of entries */
  maxSize: number;
  defaultTtl: number;
  /** Optional callback when entries are removed */
  onDispose?: (key: string, value: T, reason: DisposeReason) => void;
}

/** Caches created so far: each one's number keeps its reads in flight apart from every other cache's. */
let cacheCount = 0;

/** TTL cache with prefix invalidation: a timer expires entries and eviction takes the soonest-expiring one. */
export class TTLCache<T> {
  private cache: BaseTTLCache<string, T>;
  private readonly defaultTtl: number;
  private readonly flightScope = `ttl-cache:${cacheCount++}`;
  /** Counts invalidations: a read that started under an earlier count stores nothing. */
  private generation = 0;

  constructor(options: TTLCacheOptions<T>) {
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
}
