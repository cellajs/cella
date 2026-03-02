import type { Context, MiddlewareHandler } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Env } from '#/lib/context';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email' | 'userId' | 'tenantId';
export type Identifiers = Record<RateLimitIdentifier, string | null>;

type LimiterStatusLists = {
  successStatusCodes?: number[];
  failStatusCodes?: number[];
  ignoredStatusCodes?: number[];
};

export type RateLimitOptions = Partial<RateLimiterDrizzle> | (Partial<RateLimiterMemory> & LimiterStatusLists);

/** Middleware handler with attached rate limiter config for status checks */
export type RateLimiterHandler = MiddlewareHandler<Env> & { keyPrefix: string; points: number };

/** Optional configuration for rate limiter middleware */
export interface RateLimiterOpts {
  /** Custom rate limit configuration (points, duration, blockDuration, etc.) */
  limits?: RateLimitOptions;
  /** Function name override for OpenAPI documentation (defaults to `${key}Limiter`) */
  functionName?: string;
  /** Short human-readable label for OpenAPI documentation */
  name?: string;
  /** Description for OpenAPI documentation */
  description?: string;
  /** Callback fired when rate limit blocks a request (fire-and-forget, errors are swallowed) */
  onBlock?: (rateLimitKey: string) => void;
  /** Dynamic points to consume per request (for points-weighted limiters). Called at request time. */
  getConsumePoints?: (ctx: Context<Env>) => number | Promise<number>;
  /** Dynamic points budget read from tenant restrictions. Overrides static `limits.points` at runtime. */
  getPointsBudget?: (ctx: Context<Env>) => number;
}
