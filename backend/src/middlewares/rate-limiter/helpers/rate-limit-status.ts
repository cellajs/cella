import type { Context } from 'hono';
import type { RateLimiterRes } from 'rate-limiter-flexible';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { defaultOptions, slowOptions } from '#/middlewares/rate-limiter/core';
import { getRateLimiterInstance } from '#/middlewares/rate-limiter/helpers/limiter-instance';
import type { RateLimiterHandler } from '#/middlewares/rate-limiter/types';
import { getIp } from '#/utils/get-ip';

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
