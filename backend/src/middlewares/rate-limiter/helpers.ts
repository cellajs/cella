import type { Context } from 'hono';
import { RateLimiterDrizzle, RateLimiterMemory, type RateLimiterRes } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb as db } from '#/db/db';
import { env } from '#/env';
import { defaultOptions, slowOptions } from '#/middlewares/rate-limiter/core';
import type { Identifiers, RateLimiterHandler, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { getIp } from '#/utils/get-ip';
import { toRateLimitIp } from '#/utils/ip-subnet';

type RateLimiterOptions = {
  keyPrefix?: string;
  points: number;
  duration: number;
  blockDuration?: number;
};

// Singleton registry: reuse limiter instances with the same keyPrefix to share internal caches and reduce DB round-trips
const limiterRegistry = new Map<string, RateLimiterDrizzle | RateLimiterMemory>();

/** Prefix-memoized Drizzle limiter; an in-memory insurance limiter covers DB outages and blocks stay local. */
export const getRateLimiterInstance = (options: RateLimiterOptions) => {
  const keyPrefix = options.keyPrefix ?? '';
  const existing = limiterRegistry.get(keyPrefix);
  if (existing) return existing;

  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  let instance: RateLimiterDrizzle | RateLimiterMemory;

  if (env.NODB) {
    instance = new RateLimiterMemory(enforcedOptions);
  } else {
    instance = new RateLimiterDrizzle({
      ...enforcedOptions,
      storeClient: db,
      schema: rateLimitsTable,
      // Fail-open: an unreachable DB falls back to the in-memory limiter so the request survives without a 500
      insuranceLimiter: new RateLimiterMemory(enforcedOptions),
      // Block over-limit keys in-memory so repeat offenders miss the DB; blockDuration=0 uses the remaining window
      inMemoryBlockOnConsumed: enforcedOptions.points,
    });
  }

  limiterRegistry.set(keyPrefix, instance);
  return instance;
};

export const rateLimitError = (ctx: Context<Env>, limitState: RateLimiterRes, rateLimitKey: string) => {
  const retryAfter = getRetryAfter(limitState.msBeforeNext);
  ctx.header('Retry-After', retryAfter);
  throw new AppError(429, 'too_many_requests', 'warn', { meta: { rateLimitKey, retryAfter: Number(retryAfter) } });
};

/** Floored to 1s so sub-second waits never emit `Retry-After: 0`, which clients read as "retry immediately". */
export const getRetryAfter = (ms: number) => Math.max(1, Math.round(ms / 1000)).toString();

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
        // Normalize the email exactly like validation so aliases share a bucket; this runs before Zod, so guard the type
        if (ctx.req.header('content-type')?.includes('application/json')) {
          try {
            const body = (await ctx.req.json()) as { email?: unknown };
            if (typeof body.email === 'string' && body.email) results.email = body.email.toLowerCase().trim();
          } catch {}
        }
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
        const tenantId = ctx.var.tenantId;
        if (tenantId) results.tenantId = tenantId;
        break;
      }
    }
  }

  return results;
};

export const checkIpRateLimitStatus = async (ctx: Context<Env>, rateLimiterHandler: RateLimiterHandler) => {
  const ip = getIp(ctx);
  return checkRateLimitStatus(rateLimiterHandler, `ip:${toRateLimitIp(ip ?? '')}`);
};

/** Reports whether a key is blocked without consuming points. /auth/health uses it to detect restrictedMode. */
export const checkRateLimitStatus = async (
  rateLimiterHandler: RateLimiterHandler,
  rateLimitKey: string,
): Promise<{ isLimited: boolean; retryAfter?: number }> => {
  const { keyPrefix, points: mainPoints } = rateLimiterHandler;
  const limiter = getRateLimiterInstance({ ...defaultOptions, points: mainPoints, keyPrefix });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` });

  const [state, slowState] = await Promise.all([limiter.get(rateLimitKey), slowLimiter.get(rateLimitKey)]);

  if (state && state.consumedPoints > mainPoints) {
    return { isLimited: true, retryAfter: Math.round(state.msBeforeNext / 1000) };
  }

  if (slowState && slowState.consumedPoints > (slowOptions.points ?? 100)) {
    return { isLimited: true, retryAfter: Math.round(slowState.msBeforeNext / 1000) };
  }

  return { isLimited: false };
};

/** Length of a `{ ids: [...] }` or top-level array body, falling back to 1 so every request costs a point. */
export const bulkBodyLength = async (ctx: Context<Env>): Promise<number> => {
  try {
    const contentType = ctx.req.header('content-type');
    if (!contentType?.includes('application/json')) return 1;

    const body = await ctx.req.json();

    if (Array.isArray(body)) return Math.max(body.length, 1);
    if (body && Array.isArray(body.ids)) return Math.max(body.ids.length, 1);
  } catch {}

  return 1;
};
