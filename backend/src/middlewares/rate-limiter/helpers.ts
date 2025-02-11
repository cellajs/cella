import type { Context } from 'hono';
import { type IRateLimiterPostgresOptions, RateLimiterMemory, RateLimiterPostgres, type RateLimiterRes } from 'rate-limiter-flexible';
import { db } from '#/db/db';
import { env } from '#/env';
import { errorResponse } from '#/lib/errors';
import { defaultOptions } from '#/middlewares/rate-limiter/core';

/**
 * Get instance of rate limiter with correct store
 */
export const getRateLimiterInstance = (options: Omit<IRateLimiterPostgresOptions, 'storeClient'>) => {
  // tableName is always set to defaultOptions.tableName
  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  return env.PGLITE
    ? new RateLimiterMemory(enforcedOptions)
    : new RateLimiterPostgres({
        ...enforcedOptions,
        storeClient: db.$client,
      });
};

/**
 * Rate limit Error response
 */
export const rateLimitError = (ctx: Context, limitState: RateLimiterRes, rateLimitKey: string) => {
  ctx.header('Retry-After', getRetryAfter(limitState.msBeforeNext));
  return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { rateLimitKey });
};

/**
 * Get Retry-After header value
 */
export const getRetryAfter = (ms: number) => Math.round(ms / 1000).toString() || '1';
