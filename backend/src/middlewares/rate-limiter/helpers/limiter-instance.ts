import { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';
import { defaultOptions } from '#/middlewares/rate-limiter/core';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';

type RateLimiterOptions = {
  keyPrefix?: string;
  points: number;
  duration: number;
  blockDuration?: number;
};

// Singleton registry: reuse limiter instances with the same keyPrefix to share internal caches and reduce DB round-trips
const limiterRegistry = new Map<string, RateLimiterDrizzle | RateLimiterMemory>();

/**
 * Get instance of rate limiter with correct store.
 * Uses RateLimiterDrizzle with a Drizzle-managed schema - no async table creation needed.
 * Instances are memoized by keyPrefix so all consumers sharing a prefix share one warm cache.
 *
 * Resilience features:
 * - `insuranceLimiter`: RateLimiterMemory fallback when DB is unreachable (fail-open with memory safety net)
 * - `inMemoryBlockOnConsumed`: Once a key exceeds its points budget, subsequent requests are rejected
 *   in-memory without hitting the DB — reduces DDoS DB pressure to zero for blocked keys
 */
export const getRateLimiterInstance = (options: RateLimiterOptions) => {
  const keyPrefix = options.keyPrefix ?? '';
  const existing = limiterRegistry.get(keyPrefix);
  if (existing) return existing;

  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  let instance: RateLimiterDrizzle | RateLimiterMemory;

  // Use in-memory rate limiter when no database is configured
  if (env.NODB) {
    instance = new RateLimiterMemory(enforcedOptions);
  } else {
    instance = new RateLimiterDrizzle({
      ...enforcedOptions,
      storeClient: db,
      schema: rateLimitsTable,
      // Fail-open: when DB is unreachable, fall back to in-memory limiter
      // rather than crashing the request with a 500
      insuranceLimiter: new RateLimiterMemory(enforcedOptions),
      // Block over-limit keys in-memory so repeat offenders don't hit the DB.
      // When blockDuration=0 (e.g. pointsLimiter), uses remaining window time.
      inMemoryBlockOnConsumed: enforcedOptions.points,
    });
  }

  limiterRegistry.set(keyPrefix, instance);
  return instance;
};
