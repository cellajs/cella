import type { Context } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory, type RateLimiterRes } from 'rate-limiter-flexible';
import { baseDb as db } from '#/db/db';
import { rateLimitsTable } from '#/db/schema/rate-limits';
import { env } from '#/env';
import type { Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { defaultOptions, slowOptions } from '#/middlewares/rate-limiter/core';
import type { Identifiers, RateLimiterHandler, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { getIp } from '#/utils/get-ip';

type RateLimiterOptions = {
  keyPrefix?: string;
  points?: number;
  duration?: number;
  blockDuration?: number;
};

// Singleton registry: reuse limiter instances with the same keyPrefix to share internal caches and reduce DB round-trips
const limiterRegistry = new Map<string, RateLimiterDrizzle | RateLimiterMemory>();

/**
 * Get instance of rate limiter with correct store.
 * Uses RateLimiterDrizzle with a Drizzle-managed schema - no async table creation needed.
 * Instances are memoized by keyPrefix so all consumers sharing a prefix share one warm cache.
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

  // Use in-memory rate limiter for basic mode and none mode (no database)
  if (env.DEV_MODE === 'basic' || env.DEV_MODE === 'none') {
    instance = new RateLimiterMemory(enforcedOptions);
  } else {
    instance = new RateLimiterDrizzle({
      ...enforcedOptions,
      storeClient: db,
      schema: rateLimitsTable,
    });
  }

  limiterRegistry.set(keyPrefix, instance);
  return instance;
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
    tenantId: null,
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
      case 'tenantId': {
        const tenantId = ctx.req.param('tenantId') || ctx.var.tenantId;
        if (tenantId) results.tenantId = tenantId;
        break;
      }
    }
  }

  return results;
};

/**
 * Check if an IP is currently rate-limited for a given limiter.
 * Shorthand for getIp + checkRateLimitStatus.
 */
export const checkIpRateLimitStatus = async (ctx: Context<Env>, rateLimiterHandler: RateLimiterHandler) => {
  const ip = getIp(ctx);
  return checkRateLimitStatus(rateLimiterHandler, `ip:${ip}`);
};

/**
 * Check if a rate limit key is currently blocked without consuming points.
 * Used by /auth/health to detect restrictedMode for email enumeration protection.
 */
export const checkRateLimitStatus = async (
  rateLimiterHandler: RateLimiterHandler,
  rateLimitKey: string,
): Promise<{ isLimited: boolean; retryAfter?: number }> => {
  const { keyPrefix, points: mainPoints } = rateLimiterHandler;
  const limiter = getRateLimiterInstance({ ...defaultOptions, points: mainPoints, keyPrefix });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` });

  const [state, slowState] = await Promise.all([limiter.get(rateLimitKey), slowLimiter.get(rateLimitKey)]);

  // Check main limiter
  if (state && state.consumedPoints > mainPoints) {
    return { isLimited: true, retryAfter: Math.round(state.msBeforeNext / 1000) };
  }

  // Check slow brute force limiter
  if (slowState && slowState.consumedPoints > (slowOptions.points ?? 100)) {
    return { isLimited: true, retryAfter: Math.round(slowState.msBeforeNext / 1000) };
  }

  return { isLimited: false };
};

/**
 * Read the length of the bulk body array from the request.
 * Supports `{ ids: [...] }` shape (bulk delete) and top-level arrays (bulk create).
 * Returns 1 as fallback so every request costs at least 1 point.
 */
export const bulkBodyLength = async (ctx: Context<Env>): Promise<number> => {
  try {
    const contentType = ctx.req.header('content-type');
    if (!contentType?.includes('application/json')) return 1;

    const body = await ctx.req.raw.clone().json();

    if (Array.isArray(body)) return Math.max(body.length, 1);
    if (body && Array.isArray(body.ids)) return Math.max(body.ids.length, 1);
  } catch {}

  return 1;
};
