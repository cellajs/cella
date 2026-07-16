import type { Context, MiddlewareHandler } from 'hono';
import type { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email' | 'userId' | 'tenantId';
/**
 * One segment of a rate limit key: a single identifier, or a fallback chain where
 * the first available identifier wins (e.g. `['userId', 'ip']` keys authenticated
 * traffic per user and anonymous traffic per IP). A chain must resolve; a request
 * matching none of its identifiers is rejected.
 */
export type RateLimitKeyPart = RateLimitIdentifier | RateLimitIdentifier[];
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
  onBlock?: (rateLimitKey: string, ctx: Context<Env>) => void;
  /** Dynamic points to consume per request (for points-weighted limiters). Called at request time. */
  getConsumePoints?: (ctx: Context<Env>) => number | Promise<number>;
  /**
   * Dynamic points budget read from tenant restrictions. Clamped to the static `limits.points`
   * ceiling; 0 means "no tenant-specific limit" and falls back to that ceiling.
   */
  getPointsBudget?: (ctx: Context<Env>) => number;
}
