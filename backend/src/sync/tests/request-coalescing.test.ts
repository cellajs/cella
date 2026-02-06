import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearInFlight, coalesce, inFlightCount, isInFlight } from '#/sync/request-coalescing';

describe('request-coalescing', () => {
  beforeEach(() => {
    clearInFlight();
  });

  describe('coalesce', () => {
    it('should execute fetcher on first call', async () => {
      const fetcher = vi.fn().mockResolvedValue('result');

      const result = await coalesce('key1', fetcher);

      expect(result).toBe('result');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should share result for concurrent calls with same key', async () => {
      let resolvePromise: (value: string) => void;
      const fetcherPromise = new Promise<string>((resolve) => {
        resolvePromise = resolve;
      });
      const fetcher = vi.fn().mockReturnValue(fetcherPromise);

      // Start 3 concurrent requests
      const promise1 = coalesce('key1', fetcher);
      const promise2 = coalesce('key1', fetcher);
      const promise3 = coalesce('key1', fetcher);

      // Fetcher should only be called once
      expect(fetcher).toHaveBeenCalledTimes(1);

      // All should be in-flight
      expect(isInFlight('key1')).toBe(true);

      // Resolve the promise
      resolvePromise!('shared-result');

      // All should get same result
      const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
      expect(result1).toBe('shared-result');
      expect(result2).toBe('shared-result');
      expect(result3).toBe('shared-result');
    });

    it('should not share between different keys', async () => {
      const fetcher1 = vi.fn().mockResolvedValue('result1');
      const fetcher2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([coalesce('key1', fetcher1), coalesce('key2', fetcher2)]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(fetcher1).toHaveBeenCalledTimes(1);
      expect(fetcher2).toHaveBeenCalledTimes(1);
    });

    it('should clean up after completion', async () => {
      await coalesce('key1', async () => 'result');

      expect(isInFlight('key1')).toBe(false);
      expect(inFlightCount()).toBe(0);
    });

    it('should clean up after error', async () => {
      const failingFetcher = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(coalesce('key1', failingFetcher)).rejects.toThrow('fail');

      expect(isInFlight('key1')).toBe(false);
    });

    it('should propagate errors to all waiting callers', async () => {
      let rejectPromise: (error: Error) => void;
      const fetcherPromise = new Promise<string>((_, reject) => {
        rejectPromise = reject;
      });
      const fetcher = vi.fn().mockReturnValue(fetcherPromise);

      const promise1 = coalesce('key1', fetcher);
      const promise2 = coalesce('key1', fetcher);

      rejectPromise!(new Error('shared-error'));

      await expect(promise1).rejects.toThrow('shared-error');
      await expect(promise2).rejects.toThrow('shared-error');
    });
  });

  describe('helpers', () => {
    it('should track in-flight count', async () => {
      let resolve1: () => void;
      let resolve2: () => void;

      const promise1 = coalesce(
        'key1',
        () =>
          new Promise<void>((r) => {
            resolve1 = r;
          }),
      );
      const promise2 = coalesce(
        'key2',
        () =>
          new Promise<void>((r) => {
            resolve2 = r;
          }),
      );

      expect(inFlightCount()).toBe(2);

      resolve1!();
      await promise1;
      expect(inFlightCount()).toBe(1);

      resolve2!();
      await promise2;
      expect(inFlightCount()).toBe(0);
    });
  });
});
