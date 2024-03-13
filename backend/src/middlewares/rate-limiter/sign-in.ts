import type { MiddlewareHandler } from 'hono';

import { RateLimiterPostgres } from 'rate-limiter-flexible';
import { errorResponse } from '../../lib/errors';

import { queryClient } from '../../db/db';
import type { Env } from '../../types/common';

const getUsernameIPkey = (username?: string, ip?: string) => `${username}_${ip}`;

// Sign in rate limiter
const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 5;

const limiterSlowBruteByIP = new RateLimiterPostgres({
  storeClient: queryClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterPostgres({
  storeClient: queryClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60, // Store number for 1 hour since first fail
  blockDuration: 60 * 5, // Block for 5 min
});

export const signInRateLimiter = (): MiddlewareHandler<Env> => async (ctx, next) => {
  const ipAddr = ctx.req.header('x-forwarded-for')?.split(',')[0] || '';
  // biome-ignore lint/suspicious/noExplicitAny: it's required to use `any` here
  const body = await ctx.req.raw.clone().json<any>();

  if (!body.email || !ipAddr) {
    return next();
  }

  const usernameIPkey = getUsernameIPkey(body.email, ipAddr);

  const [resUsernameAndIP, resSlowByIP] = await Promise.all([
    limiterConsecutiveFailsByUsernameAndIP.get(usernameIPkey),
    limiterSlowBruteByIP.get(ipAddr),
  ]);

  let retrySecs = 0;

  // Check if IP or Username + IP is already blocked
  if (resSlowByIP !== null && resSlowByIP.consumedPoints > maxWrongAttemptsByIPperDay) {
    retrySecs = Math.round(resSlowByIP.msBeforeNext / 1000) || 1;
  } else if (resUsernameAndIP !== null && resUsernameAndIP.consumedPoints > maxConsecutiveFailsByUsernameAndIP) {
    retrySecs = Math.round(resUsernameAndIP.msBeforeNext / 1000) || 1;
  }

  if (retrySecs > 0) {
    ctx.header('Retry-After', String(retrySecs));
    return errorResponse(ctx, 429, 'too_many_requests', 'warn', true, { usernameIPkey });
  }

  await limiterSlowBruteByIP.consume(ipAddr);

  await next();

  if (ctx.res.status === 401) {
    try {
      await limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey);
    } catch (error) {
      return errorResponse(ctx, 429, 'too_many_requests', 'warn', true, { usernameIPkey });
    }
  } else {
    await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
  }
};
