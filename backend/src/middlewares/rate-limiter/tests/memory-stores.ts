import { RateLimiterMemory } from 'rate-limiter-flexible';

/** The in-memory stores standing in for the database ones, memoized by key prefix as production does. */
export const memoryStores = new Map<string, RateLimiterMemory>();

/**
 * Replaces the database stores with real `RateLimiterMemory` instances, so a test reads counts and blocks off the store.
 * Use at top level, after `vi.unmock('#/middlewares/rate-limiter/core')`:
 * `vi.mock('#/middlewares/rate-limiter/helpers', async (importOriginal) => (await import('./memory-stores')).memoryStoresMock(importOriginal))`
 */
export const memoryStoresMock = async (importOriginal: () => Promise<Record<string, unknown>>) => ({
  ...(await importOriginal()),
  getRateLimiterInstance: (options: {
    keyPrefix?: string;
    points: number;
    duration: number;
    blockDuration?: number;
  }) => {
    const keyPrefix = options.keyPrefix ?? '';
    const existing = memoryStores.get(keyPrefix);
    if (existing) return existing;
    const store = new RateLimiterMemory(options);
    memoryStores.set(keyPrefix, store);
    return store;
  },
});
