import type { Context, MiddlewareHandler } from 'hono';
import type { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email' | 'userId' | 'actorId' | 'tenantId';
/** One key segment: an identifier, or a chain where the first available one wins. An unresolved chain rejects. */
export type RateLimitKeyPart = RateLimitIdentifier | RateLimitIdentifier[];
export type Identifiers = Record<RateLimitIdentifier, string | null>;

/** A bucket's budget, its counting window and how long a spent budget blocks, in seconds; a zero block lasts the window. */
export interface BucketLimits {
  points: number;
  duration: number;
  blockDuration: number;
}

export type LimiterStore = RateLimiterDrizzle | RateLimiterMemory;

/** A bucket a limiter counts in. */
export interface Bucket {
  store: LimiterStore;
  limits: BucketLimits;
}

/** How a handler's answer settles a reserved attempt. */
export type Outcome = 'fail' | 'success' | 'other';

/**
 * A bucket attempts are reserved in before the work they bound runs, with its settlement rule: the outcome it keeps an
 * attempt for (a kept failure at a spent budget blocks the key), and whether a success ends the series.
 */
export interface Tier extends Bucket {
  counts: 'fail' | 'success';
  resetsOnSuccess: boolean;
}

type LimiterStatusLists = {
  successStatusCodes?: number[];
  failStatusCodes?: number[];
  ignoredStatusCodes?: number[];
};

export type RateLimitOptions = Partial<BucketLimits> & LimiterStatusLists;

export type RateLimiterHandler = MiddlewareHandler<Env> & { keyPrefix: string; buckets: Bucket[] };

export interface RateLimiterOpts {
  limits?: RateLimitOptions;
  /** Function name override for OpenAPI documentation (defaults to `${key}Limiter`) */
  functionName?: string;
  /** Short human-readable label for OpenAPI documentation */
  name?: string;
  /** Description for OpenAPI documentation */
  description?: string;
  /** Dynamic points to consume per request (for points-weighted limiters). Called at request time. */
  getConsumePoints?: (ctx: Context<Env>) => number | Promise<number>;
  /** Tenant budget clamped to the static `limits.points` ceiling; 0 means no tenant limit and uses that ceiling. */
  getPointsBudget?: (ctx: Context<Env>) => number;
}
