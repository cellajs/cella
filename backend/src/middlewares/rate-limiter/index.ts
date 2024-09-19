import type { MiddlewareHandler } from 'hono';

import { type IRateLimiterPostgresOptions, RateLimiterMemory, RateLimiterPostgres, RateLimiterRes } from 'rate-limiter-flexible';
import { errorResponse } from '#/lib/errors';

import { env } from '#/../env';
import { queryClient } from '#/db/db';
import { getContextUser } from '#/lib/context';
import type { Env } from '#/types/app';

type RateLimiterMode = 'success' | 'fail' | 'limit';

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

const getUsernameIPkey = (username?: string, ip?: string) => `${username}_${ip}`;

function rateLimiterMiddleware(this: RateLimiterPostgres | RateLimiterMemory, mode: RateLimiterMode = 'fail'): MiddlewareHandler<Env> {
  if (mode === 'success' || mode === 'fail') {
    this.points = this.points - 1;
  }

  return async (ctx, next) => {
    const ipAddr = ctx.req.header('x-forwarded-for');
    const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json() : undefined;
    const user = getContextUser();
    const username = body?.email || user?.id;

    if (!ipAddr && !username) {
      return next();
    }

    const usernameIPkey = getUsernameIPkey(username, ipAddr);

    const res = await this.get(usernameIPkey);

    let retrySecs = 0;

    // Check if IP or Username + IP is already blocked
    if (res !== null && res.consumedPoints > this.points) {
      retrySecs = Math.round(res.msBeforeNext / 1000) || 1;
    }

    if (retrySecs > 0) {
      ctx.header('Retry-After', String(retrySecs));
      return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { usernameIPkey });
    }

    if (mode === 'limit') {
      try {
        await this.consume(usernameIPkey);
      } catch (rlRejected) {
        if (rlRejected instanceof RateLimiterRes) {
          ctx.header('Retry-After', String(Math.round(rlRejected.msBeforeNext / 1000) || 1));
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

// Default options to limit fail requests ('fail' mode)
const defaultOptions = {
  tableName: 'rate_limits', // Name of table in database
  points: 5, // 5 requests
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 10, // Block for 10 minutes
};

export const getRateLimiterInstance = (options: Omit<IRateLimiterPostgresOptions, 'storeClient'> = defaultOptions) =>
  env.PGLITE
    ? new RateLimiterMemory(options)
    : new RateLimiterPostgres({
        ...options,
        storeClient: queryClient,
      });

export const rateLimiter = (options: Omit<IRateLimiterPostgresOptions, 'storeClient'> = defaultOptions, mode: RateLimiterMode = 'fail') =>
  rateLimiterMiddleware.call(getRateLimiterInstance(options), mode);

export const authRateLimiter = rateLimiter({ points: 5, duration: 60 * 60, blockDuration: 60 * 10, keyPrefix: 'auth_fail' }, 'fail');
