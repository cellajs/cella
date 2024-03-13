import type { MiddlewareHandler } from 'hono';

import { type IRateLimiterPostgresOptions, RateLimiterPostgres, RateLimiterRes } from 'rate-limiter-flexible';
import { errorResponse } from '../../lib/errors';

import { queryClient } from '../../db/db';
import type { Env } from '../../types/common';

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

class RateLimiter extends RateLimiterPostgres {
  public middleware(mode: RateLimiterMode = 'fail'): MiddlewareHandler<Env> {
    if (mode === 'success' || mode === 'fail') {
      this.points = this.points - 1;
    }

    return async (ctx, next) => {
      const ipAddr = ctx.req.header('x-forwarded-for');
      // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
      const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json<any>() : undefined;
      const user = ctx.get('user');
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
}

// Default options to limit fail requests ('fail' mode)
const defaultOptions = {
  points: 5, // 5 requests
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 10, // Block for 10 minutes
};

export const rateLimiter = (options: Omit<IRateLimiterPostgresOptions, 'storeClient'> = defaultOptions, mode: RateLimiterMode = 'fail') =>
  new RateLimiter({
    ...options,
    storeClient: queryClient,
  }).middleware(mode);
