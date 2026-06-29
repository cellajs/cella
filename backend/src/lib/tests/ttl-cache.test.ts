import { beforeEach, describe, expect, it } from 'vitest';
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
      // With TTL-based eviction, the soonest-expiring entry is evicted
      // Since all entries have the same TTL in this test, the oldest (first added) is evicted
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1 - unlike LRU, this does NOT refresh its position
      cache.get('key1');

      // Add new key - evicts soonest-expiring (key1, added first)
      cache.set('key4', 'value4');

      // TTL-based cache evicts by expiration time, so key1 (added first) is evicted
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

      // Wait for expiration
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

    it('should auto-expire entries (ttlcache handles automatically)', async () => {
      const shortTtlCache = new TTLCache<string>({
        maxSize: 10,
        defaultTtl: 50,
      });

      shortTtlCache.set('key1', 'value1');
      shortTtlCache.set('key2', 'value2');

      await new Promise((resolve) => setTimeout(resolve, 60));

      // Entries should be auto-expired by ttlcache timer
      expect(shortTtlCache.get('key1')).toBeUndefined();
      expect(shortTtlCache.get('key2')).toBeUndefined();
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
