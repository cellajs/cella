import type { Context, Input, MiddlewareHandler } from 'hono';

import { PostgresStore } from '@acpr/rate-limit-postgresql';
import { type ConfigType, type GeneralConfigType, rateLimiter as honoRateLimiter } from 'hono-rate-limiter';
import { errorResponse } from '#/lib/errors';

import { env } from '#/../env';
import { db } from '#/db/db';
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

// Default options to limit fail requests ('fail' mode)
const defaultOptions = {
  // tableName: "rate_limits", // Name of table in database
  limit: 5, // 5 requests
  windowMs: 60 * 60 * 1000, // within 1 hour
};

function rateLimiterMiddleware<E extends Env = Env, P extends string = string, I extends Input = Input>(
  options: Omit<GeneralConfigType<ConfigType<E, P, I>>, 'store' | 'keyGenerator'> & { keyPrefix?: string } = defaultOptions,
  mode: RateLimiterMode = 'fail',
): MiddlewareHandler<E, P, I> {
  return async (ctx, next) => {
    const ipAddr = ctx.req.header('x-forwarded-for');
    const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json() : undefined;
    const user = getContextUser();
    const username = body?.email || user?.id;

    if (!ipAddr && !username) {
      return next();
    }

    const usernameIPkey = getUsernameIPkey(username, ipAddr);

    return honoRateLimiter({
      ...options,
      // biome-ignore lint/suspicious/noExplicitAny: TODO: fix this
      store: !env.PGLITE ? (new PostgresStore(db.$client, options.keyPrefix ?? 'aggregated_store') as any) : undefined,
      keyGenerator: () => usernameIPkey,
      skipFailedRequests: mode === 'success',
      skipSuccessfulRequests: mode === 'fail',
      handler: (ctx: Context) =>
        errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, {
          usernameIPkey,
        }),
    })(ctx, next);
  };
}

export function rateLimiter<E extends Env = Env, P extends string = string, I extends Input = Input>(
  options: Omit<GeneralConfigType<ConfigType<E, P, I>>, 'store' | 'keyGenerator'> & { keyPrefix?: string } = defaultOptions,
  mode: RateLimiterMode = 'fail',
) {
  return rateLimiterMiddleware(options, mode);
}

export const authRateLimiter = rateLimiter(
  {
    limit: 1,
    windowMs: 60 * 60 * 1000,
    keyPrefix: 'auth_fail',
  },
  'fail',
);
