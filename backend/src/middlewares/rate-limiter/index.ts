import type { MiddlewareHandler } from 'hono';
import type { RateLimiterMemory, RateLimiterPostgres } from 'rate-limiter-flexible';
import { RateLimiterRes } from 'rate-limiter-flexible';

import { getContextUser } from '#/lib/context';
import { errorResponse } from '#/lib/errors';
import { getRateLimiterInstance, getRetryAfter, getUsernameIPkey } from '#/middlewares/rate-limiter/helpers';
import type { Env } from '#/types/app';
import { getIp } from '#/utils/get-ip';

type RateLimiterMode = 'success' | 'fail' | 'limit';
// Default options
export const defaultOptions = {
  tableName: 'rate_limits', // Name of table in database
  points: 5, // 5 requests
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 10, // Block for 10 minutes
};

/*
 * This file contains the implementation of a rate limiter middleware.
 * It uses the `rate-limiter-flexible` library to limit the number of requests per user or IP address.
 * https://github.com/animir/node-rate-limiter-flexible#readme
 * The rate limiter is implemented as a class `RateLimiter` that extends `RateLimiterPostgres`.
 *
 * The 'success' mode decreases the available points for the user or IP address on successful requests.
 * The 'fail' (default mode does the same but for failed requests.
 * The 'limit' mode consumes points for each request without blocking.
 *
 * Additionally, there is a separate rate limiter for sign-in requests that limits the number of failed attempts per IP address and username.
 */
function rateLimiterMiddleware(this: RateLimiterPostgres | RateLimiterMemory, mode: RateLimiterMode = 'fail'): MiddlewareHandler<Env> {
  return async (ctx, next) => {
    const ipAddr = getIp(ctx);
    const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json() : undefined;
    const user = getContextUser();
    const username = body?.email || user?.email;

    if (!ipAddr) return errorResponse(ctx, 403, 'forbidden', 'warn');

    const usernameIPkey = getUsernameIPkey(ipAddr, username);
    const res = await this.get(usernameIPkey);

    if (res !== null && res.consumedPoints > this.points) {
      ctx.header('Retry-After', getRetryAfter(res.msBeforeNext));
      return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { usernameIPkey });
    }

    if (mode === 'limit') {
      try {
        await this.consume(usernameIPkey);
      } catch (rlRejected) {
        if (rlRejected instanceof RateLimiterRes) {
          ctx.header('Retry-After', getRetryAfter(rlRejected.msBeforeNext));
          return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { usernameIPkey });
        }
        throw rlRejected;
      }
    }

    await next();

    if (ctx.res.status === 200) {
      if (mode === 'success') {
        try {
          await this.consume(usernameIPkey);
        } catch {}
      } else if (mode === 'fail') {
        await this.delete(usernameIPkey);
      }
    } else if (mode === 'fail') {
      try {
        await this.consume(usernameIPkey);
      } catch {}
    }
  };
}

// Rate limit for 10 requests per hour to prevent users sending too many invites
export const inviteLimiter = rateLimiterMiddleware.call(
  getRateLimiterInstance({ ...defaultOptions, points: 10, keyPrefix: 'invite_success' }),
  'success',
);

// Basic Rate limiter for add BE routes
export const commonLimiter = rateLimiterMiddleware.call(
  getRateLimiterInstance({ ...defaultOptions, points: 5, blockDuration: 60 * 30, keyPrefix: 'common_fail' }),
  'success',
);

// TODO: this is not very useful, we need to be able to specify the key we will use for counting the rate limit
export const authRateLimiter = rateLimiterMiddleware.call(getRateLimiterInstance({ ...defaultOptions, keyPrefix: 'auth_fail' }), 'fail');

// Prevent brute force attacks by randomly guessing tokens
export const tokenRateLimiter = rateLimiterMiddleware.call(getRateLimiterInstance({ ...defaultOptions, keyPrefix: 'token_fail' }), 'fail');
