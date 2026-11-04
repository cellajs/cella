import type { Context } from 'hono';
import type { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import type { ErrorKey } from '#/core/error';
import type { XMiddlewareHandler } from '#/core/openapi-extensions';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
/** Who a limiter counts: a signed-in user or service account (`actorId`), both set by the guards. */
export type RateLimitIdentifier = 'ip' | 'email' | 'actorId' | 'tenantId';
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

type LimiterStatusLists = { successStatusCodes?: number[]; failStatusCodes?: number[]; ignoredStatusCodes?: number[] };

export type RateLimitOptions = Partial<BucketLimits> & LimiterStatusLists;

/**
 * What the docs show of a limiter: its budget and window, in seconds, and for a failure budget how long a spent one
 * blocks. A tenant budget shows its ceiling.
 */
export interface RateLimitPolicy {
  mode: RateLimitMode;
  points: number;
  duration: number;
  blockDuration?: number;
}

/** A route limiter: `keyPrefix` (`<key>_<mode>`) starts the keys of its rows, `buckets` are what `checkRateLimitStatus` reads. */
export type RateLimiterHandler = XMiddlewareHandler & { keyPrefix: string; buckets: Bucket[] };

export interface RateLimiterOpts {
  limits?: RateLimitOptions;
  /** Function name override for OpenAPI documentation (defaults to `${key}Limiter`) */
  functionName?: string;
  /** Short human-readable label for OpenAPI documentation */
  name?: string;
  /** The error type a refusal answers with, so a client can say what to do meanwhile. Default: `too_many_requests`. */
  refusalType?: ErrorKey;
  /** True for a request the budget does not guard against: it passes, neither counted nor refused. */
  exempt?: (ctx: Context<Env>, identifiers: Identifiers) => boolean | Promise<boolean>;
  /** Description for OpenAPI documentation */
  description?: string;
  /** Dynamic points to consume per request (for points-weighted limiters). Called at request time. */
  getConsumePoints?: (ctx: Context<Env>) => number | Promise<number>;
  /** Tenant budget clamped to the static `limits.points` ceiling; 0 means no tenant limit and uses that ceiling. */
  getPointsBudget?: (ctx: Context<Env>) => number;
  /**
   * For a `limit` of at most an hour on a route called too often to pay a database transaction per request: requests
   * count in process while the key is under 80% of its budget and reach the database past that. A limiter with a
   * tenant budget counts this way too.
   */
  countsInProcess?: boolean;
}
