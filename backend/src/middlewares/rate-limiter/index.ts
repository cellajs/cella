import type { Context, MiddlewareHandler } from 'hono';
import type { RateLimiterMemory, RateLimiterPostgres } from 'rate-limiter-flexible';
import { RateLimiterRes } from 'rate-limiter-flexible';

import type { Env } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { getRateLimiterInstance, getRetryAfter } from '#/middlewares/rate-limiter/helpers';
import { getIp } from '#/utils/get-ip';

type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
type RateLimitIdentifier = 'ip' | 'email';

type RateLimitOptions = Partial<RateLimiterPostgres> | Partial<RateLimiterMemory>;

// Default options
export const defaultOptions = {
  tableName: 'rate_limits', // Name of table in database
  points: 5, // 5 requests
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 30, // Block for 30 minutes
};

// Slow brute force options
export const slowOptions = {
  tableName: defaultOptions.tableName, // Name of table in database
  points: 100, // 100 requests
  duration: 60 * 60 * 24, // within 24 hour
  blockDuration: 60 * 60 * 3, // Block for 3 hours
};

// Rate limit error response
const rateLimitError = (ctx: Context, limitState: RateLimiterRes, rateLimitKey: string) => {
  ctx.header('Retry-After', getRetryAfter(limitState.msBeforeNext));
  return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { rateLimitKey });
};

/*
 * This file contains the implementation of a rate limiter middleware, which supports multiple modes.
 * It uses the `rate-limiter-flexible` library to limit the number of requests.
 * https://github.com/animir/node-rate-limiter-flexible#readme
 *
 * The 'limit' mode consumes points for each failed/successful request.
 * The 'success' mode decreases the available points on successful requests only.
 * The 'fail' decreases points on failed requests only.
 * The 'failseries' decreases points on consecutive failed requests: it resets the rate limit on a successful request.
 *
 * Each mode runs a slow brute force instance in parallel to the rate limiter instance itself.
 * This is to prevent attackers from slowly trying to access data in a larger timeframe (24h).
 */

const rateLimiter = (mode: RateLimitMode, key: string, identifiers: RateLimitIdentifier[], options?: RateLimitOptions): MiddlewareHandler<Env> => {
  const limiter = getRateLimiterInstance({ ...defaultOptions, ...options, keyPrefix: `${key}_${mode}` });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${key}_${mode}:slow` });

  return async (ctx, next) => {
    const ipAddr = getIp(ctx);
    const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json() : undefined;

    // Stop if ip is an identifier and not available
    if (!ipAddr && identifiers.includes('ip')) return errorResponse(ctx, 403, 'forbidden', 'warn');

    // Generate rate limit key
    let rateLimitKey = '';
    if (identifiers.includes('email')) rateLimitKey += body?.email || '';
    if (identifiers.includes('ip')) rateLimitKey += `#${ipAddr}`;

    const limitState = await limiter.get(rateLimitKey);
    const slowLimitState = await slowLimiter.get(rateLimitKey);

    // If already rate limited, return 429
    if (limitState !== null && limitState.consumedPoints > limiter.points) return rateLimitError(ctx, limitState, rateLimitKey);

    // If slowly brute forcing, return 429
    if (slowLimitState !== null && slowLimitState.consumedPoints > slowLimiter.points) return rateLimitError(ctx, slowLimitState, rateLimitKey);

    // If the rate limit mode is 'limit', consume points without blocking unless the limit is reached
    if (mode === 'limit') {
      try {
        await limiter.consume(rateLimitKey);
      } catch (rlRejected) {
        if (rlRejected instanceof RateLimiterRes) return rateLimitError(ctx, rlRejected, rateLimitKey);
        throw rlRejected;
      }
    }

    // Continue with request itself
    await next();

    if (ctx.res.status === 200) {
      // If the mode is 'success', consume points on successful requests
      if (mode === 'success') {
        try {
          await limiter.consume(rateLimitKey);
        } catch {}
        // If the mode is 'failseries', delete the rate limit on successful request
      } else if (mode === 'failseries') {
        await limiter.delete(rateLimitKey);
      }

      // If the request is unauthorized or not found, consume point
    } else if (['fail', 'failseries'].includes(mode) && [401, 403, 404].includes(ctx.res.status)) {
      const slowRateLimitKey = ipAddr || rateLimitKey;

      // To prevent slow brute force attacks, consume points on every failed request during 24 hours window duration
      try {
        await slowLimiter.consume(slowRateLimitKey);
      } catch (rlRejected) {
        if (rlRejected instanceof RateLimiterRes) return rateLimitError(ctx, rlRejected, slowRateLimitKey);
        throw rlRejected;
      }

      // Consume points for the specific rate limit
      try {
        await limiter.consume(rateLimitKey);
      } catch {}
    }
  };
};

// Email spam limit for endpoints where emails are sent to others. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
export const spamLimiter = rateLimiter('success', 'spam', ['ip'], { points: 10, blockDuration: 60 * 60 });

// Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 5 consecutive failed requests in 1 hour
export const emailEnumLimiter = rateLimiter('failseries', 'email_enum', ['ip']);

// Password limiter to prevent users from guessing passwords. Blocks user sign in for 30 min after 5 consecutive failed requests in 1 hour
export const passwordLimiter = rateLimiter('failseries', 'password', ['ip', 'email']);

// Prevent brute force attacks by systemmatically trying tokens or secrets. Blocks IP for 30 minutes after 5 consecutive failed requests in 1 hour
export const tokenLimiter = rateLimiter('failseries', 'token', ['ip']);
