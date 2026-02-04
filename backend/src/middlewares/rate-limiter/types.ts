import { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email' | 'userId';
export type Identifiers = Record<RateLimitIdentifier, string | null>;

type LimiterStatusLists = {
  successStatusCodes?: number[];
  failStatusCodes?: number[];
  ignoredStatusCodes?: number[];
};

export type RateLimitOptions = Partial<RateLimiterDrizzle> | (Partial<RateLimiterMemory> & LimiterStatusLists);

/** Optional configuration for rate limiter middleware */
export interface RateLimiterOpts {
  /** Custom rate limit configuration (points, duration, blockDuration, etc.) */
  limits?: RateLimitOptions;
  /** Name override for OpenAPI documentation (defaults to `${key}Limiter`) */
  name?: string;
  /** Description for OpenAPI documentation */
  description?: string;
}
