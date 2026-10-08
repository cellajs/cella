import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TTLCache } from '#/lib/ttl-cache';

describe('TTLCache', () => {
  let cache: TTLCache<string>;

  beforeEach(() => {
    cache = new TTLCache<string>({
      maxSize: 3,
      defaultTtl: 1000, // 1 second
    });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should evict soonest-expiring when at capacity (TTL-based, not LRU)', () => {
      // All entries share a TTL here, so the oldest expires soonest and is the one evicted
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 - unlike LRU, this does NOT refresh its position
      cache.get('key1');

      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should update position on set of existing key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Update key1 to make it recently used
      cache.set('key1', 'updated1');

      // Add new key, should evict key2
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('updated1');
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new TTLCache<string>({
        maxSize: 10,
        defaultTtl: 50, // 50ms
      });

      shortTtlCache.set('key1', 'value1');
      expect(shortTtlCache.get('key1')).toBe('value1');

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(shortTtlCache.get('key1')).toBeUndefined();
    });

    it('should support custom TTL per entry', async () => {
      cache.set('key1', 'value1', 50); // 50ms TTL
      cache.set('key2', 'value2', 200); // 200ms TTL

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBe('value2');
    });
  });

  describe('invalidation', () => {
    it('should invalidate entries by prefix', () => {
      cache.set('page:1:v1', 'data1');
      cache.set('page:1:v2', 'data2');
      cache.set('page:2:v1', 'data3');

      const deleted = cache.invalidateByPrefix('page:1:');

      expect(deleted).toBe(2);
      expect(cache.get('page:1:v1')).toBeUndefined();
      expect(cache.get('page:1:v2')).toBeUndefined();
      expect(cache.get('page:2:v1')).toBe('data3');
    });
  });

  describe('load', () => {
    /** A read whose answer the test holds until it resolves or rejects it. */
    const heldRead = () => {
      let resolve: (value: string) => void = () => {};
      let reject: (reason: Error) => void = () => {};
      const answer = new Promise<string>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { read: vi.fn(() => answer), resolve, reject };
    };

    it('returns a cached value without reading', async () => {
      cache.set('key1', 'cached');
      const read = vi.fn(async () => 'read');

      expect(await cache.load('key1', read)).toBe('cached');
      expect(read).not.toHaveBeenCalled();
    });

    it('reads once for concurrent loads of a key that is not cached, and caches the value', async () => {
      const held = heldRead();

      const loads = Array.from({ length: 20 }, () => cache.load('key1', held.read));
      held.resolve('value1');

      expect(await Promise.all(loads)).toEqual(Array(20).fill('value1'));
      expect(held.read).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBe('value1');
    });

    it('reads each key on its own', async () => {
      const read = vi.fn(async () => 'value');

      await Promise.all([cache.load('key1', read), cache.load('key2', read)]);

      expect(read).toHaveBeenCalledTimes(2);
    });

    it('must not cache a value read before an invalidation', async () => {
      // Each way of invalidating counts, also when it finds no entry: the read in flight has stored none yet.
      const invalidations = [
        () => cache.delete('key1'),
        () => cache.invalidateByPrefix('key'),
        () => cache.invalidateWhere(() => false),
        () => cache.clear(),
        () => cache.discardPendingLoads(),
      ];
      for (const invalidate of invalidations) {
        const stale = heldRead();
        const pending = cache.load('key1', stale.read);
        invalidate();
        stale.resolve('before');

        // The caller that was waiting gets what its read found, and nothing is stored.
        expect(await pending).toBe('before');
        expect(cache.get('key1')).toBeUndefined();

        // The next load reads again and caches the current value.
        expect(await cache.load('key1', async () => 'after')).toBe('after');
        expect(cache.get('key1')).toBe('after');
        cache.clear();
      }
    });

    it('must not hand a value read before an invalidation to a caller that arrives after it', async () => {
      const stale = heldRead();
      const fresh = heldRead();

      const before = cache.load('key1', stale.read);
      cache.delete('key1');
      const after = cache.load('key1', fresh.read);

      // The later caller started a read of its own, and the earlier read finishing last changes nothing for it.
      expect(fresh.read).toHaveBeenCalledTimes(1);
      fresh.resolve('after');
      expect(await after).toBe('after');
      stale.resolve('before');
      expect(await before).toBe('before');
      expect(cache.get('key1')).toBe('after');
    });

    it('caches no rejected read, and the next load reads again', async () => {
      const failing = heldRead();

      const loads = [cache.load('key1', failing.read), cache.load('key1', failing.read)];
      failing.reject(new Error('database away'));

      // Every caller sharing the read gets its failure.
      for (const load of loads) await expect(load).rejects.toThrow('database away');
      expect(failing.read).toHaveBeenCalledTimes(1);
      expect(cache.get('key1')).toBeUndefined();

      expect(await cache.load('key1', async () => 'value1')).toBe('value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('caches no undefined result, and the next load reads again', async () => {
      const read = vi.fn(async (): Promise<string | undefined> => undefined);

      expect(await cache.load('key1', read)).toBeUndefined();
      expect(await cache.load('key1', read)).toBeUndefined();

      expect(read).toHaveBeenCalledTimes(2);
      expect(cache.size).toBe(0);
    });

    it('keeps the reads of two caches apart', async () => {
      const other = new TTLCache<string>({ maxSize: 3, defaultTtl: 1000 });
      const held = heldRead();
      const otherRead = vi.fn(async () => 'other');

      const pending = cache.load('key1', held.read);
      expect(await other.load('key1', otherRead)).toBe('other');
      held.resolve('value1');

      expect(await pending).toBe('value1');
      expect(otherRead).toHaveBeenCalledTimes(1);
    });

    it('tells onSet of a loaded value, and of a replacement after the replaced entry was disposed', async () => {
      const events: string[] = [];
      const indexed = new TTLCache<string>({
        maxSize: 3,
        defaultTtl: 1000,
        onSet: (key, value) => events.push(`stored ${key}=${value}`),
        onDispose: (key, value, reason) => events.push(`disposed (${reason}) ${key}=${value}`),
      });

      await indexed.load('key1', async () => 'loaded');
      indexed.set('key1', 'replaced');

      // An index kept by both callbacks ends with the key in it: the removal comes first.
      expect(events).toEqual(['stored key1=loaded', 'disposed (set) key1=loaded', 'stored key1=replaced']);
    });
  });

  describe('stats', () => {
    it('should report correct stats', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.stats;

      expect(stats.size).toBe(2);
      expect(stats.capacity).toBe(3);
      expect(stats.utilization).toBeCloseTo(2 / 3);
    });
  });
});
