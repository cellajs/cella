import type { Context, MiddlewareHandler } from 'hono';
import type { RateLimiterDrizzle, RateLimiterMemory } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email' | 'userId' | 'tenantId';
/** One key segment: an identifier, or a chain where the first available one wins. An unresolved chain rejects. */
export type RateLimitKeyPart = RateLimitIdentifier | RateLimitIdentifier[];
export type Identifiers = Record<RateLimitIdentifier, string | null>;

type LimiterStatusLists = {
  successStatusCodes?: number[];
  failStatusCodes?: number[];
  ignoredStatusCodes?: number[];
};

export type RateLimitOptions = Partial<RateLimiterDrizzle> | (Partial<RateLimiterMemory> & LimiterStatusLists);

export type RateLimiterHandler = MiddlewareHandler<Env> & { keyPrefix: string; points: number };

export interface RateLimiterOpts {
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
  /** Tenant budget clamped to the static `limits.points` ceiling; 0 means no tenant limit and uses that ceiling. */
  getPointsBudget?: (ctx: Context<Env>) => number;
}
