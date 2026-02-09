import type { Context } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory, type RateLimiterRes } from 'rate-limiter-flexible';
import { unsafeInternalDb as db } from '#/db/db';
import { rateLimitsTable } from '#/db/schema/rate-limits';
import { env } from '#/env';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { defaultOptions, slowOptions } from '#/middlewares/rate-limiter/core';
import { Identifiers, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { getIp } from '#/utils/get-ip';

type RateLimiterOptions = {
  keyPrefix?: string;
  points?: number;
  duration?: number;
  blockDuration?: number;
};

/**
 * Get instance of rate limiter with correct store.
 * Uses RateLimiterDrizzle with a Drizzle-managed schema - no async table creation needed.
 */
export const getRateLimiterInstance = (options: RateLimiterOptions) => {
  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  // Use in-memory rate limiter for basic mode and none mode (no database)
  if (env.DEV_MODE === 'basic' || env.DEV_MODE === 'none') {
    return new RateLimiterMemory(enforcedOptions);
  }

  return new RateLimiterDrizzle({
    ...enforcedOptions,
    storeClient: db,
    schema: rateLimitsTable,
  });
};

/**
 * Rate limit Error response
 */
export const rateLimitError = (ctx: Context<Env>, limitState: RateLimiterRes, rateLimitKey: string) => {
  ctx.header('Retry-After', getRetryAfter(limitState.msBeforeNext));
  throw new AppError(429, 'too_many_requests', 'warn', { meta: { rateLimitKey } });
};

/**
 * Get Retry-After header value
 */
export const getRetryAfter = (ms: number) => Math.round(ms / 1000).toString() || '1';

/**
 * Extract email from multiple sources: body, query, params, headers
 */
export const extractIdentifiers = async (
  ctx: Context<Env>,
  identifiersToExtract: RateLimitIdentifier[],
): Promise<Identifiers> => {
  const results: Identifiers = {
    email: null,
    ip: null,
    userId: null,
  };

  for (const identifier of identifiersToExtract) {
    switch (identifier) {
      case 'email': {
        let email: string | null = null;

        // JSON body
        if (ctx.req.header('content-type')?.includes('application/json')) {
          try {
            const contentLength = ctx.req.header('content-length');
            if (contentLength && contentLength !== '0') {
              const body = (await ctx.req.raw.clone().json()) as { email?: string };
              if (body.email) {
                email = body.email;
                break;
              }
            }
          } catch {}
        }

        // Query
        const queryEmail = ctx.req.query('email');
        if (queryEmail) {
          email = queryEmail;
          break;
        }

        // Params
        const paramEmail = ctx.req.param('email');
        if (paramEmail) {
          email = paramEmail;
          break;
        }

        // Headers
        const headerEmail = ctx.req.header('x-user-email');
        if (headerEmail) {
          email = headerEmail;
        }

        results.email = email;
        break;
      }

      case 'ip': {
        results.ip = getIp(ctx);
        break;
      }
      case 'userId': {
        const user = ctx.var.user;
        if (user) results.userId = user.id;
        break;
      }
    }
  }

  return results;
};

/**
 * Check if a rate limit key is currently blocked without consuming points.
 * Used by /auth/health to detect restrictedMode for email enumeration protection.
 */
export const checkRateLimitStatus = async (
  keyPrefix: string,
  rateLimitKey: string,
): Promise<{ isLimited: boolean; retryAfter?: number }> => {
  const limiter = getRateLimiterInstance({ ...defaultOptions, keyPrefix });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` });

  const [state, slowState] = await Promise.all([limiter.get(rateLimitKey), slowLimiter.get(rateLimitKey)]);

  // Check main limiter
  if (state && state.consumedPoints > (defaultOptions.points ?? 10)) {
    return { isLimited: true, retryAfter: Math.round(state.msBeforeNext / 1000) };
  }

  // Check slow brute force limiter
  if (slowState && slowState.consumedPoints > (slowOptions.points ?? 100)) {
    return { isLimited: true, retryAfter: Math.round(slowState.msBeforeNext / 1000) };
  }

  return { isLimited: false };
};
