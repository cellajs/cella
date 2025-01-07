import type { MiddlewareHandler } from 'hono';
import { errorResponse } from '#/lib/errors';
import { getRateLimiterInstance, getUsernameIPkey } from '#/middlewares/rate-limiter/helpers';
import type { Env } from '#/types/app';
import { getIp } from '#/utils/get-ip';

// Sign in rate limiter
const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 5;

const limiterSlowBruteByIP = getRateLimiterInstance({
  keyPrefix: 'signin_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = getRateLimiterInstance({
  keyPrefix: 'signin_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60, // Store number for 1 hour since first fail
  blockDuration: 60 * 10, // Block for 10 min
});

export const signInRateLimiter = (): MiddlewareHandler<Env> => async (ctx, next) => {
  const ipAddr = getIp(ctx);
  const body = await ctx.req.raw.clone().json();

  if (!body.email) return next();

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
    return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { usernameIPkey });
  }
  await limiterSlowBruteByIP.consume(ipAddr);
  await next();
  if ([401, 403, 404].includes(ctx.res.status)) {
    try {
      await limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey);
    } catch (error) {
      return errorResponse(ctx, 429, 'too_many_requests', 'warn', undefined, { usernameIPkey });
    }
  } else {
    await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
  }
};
