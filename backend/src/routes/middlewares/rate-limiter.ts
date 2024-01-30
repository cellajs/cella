import { MiddlewareHandler } from 'hono';
import { RateLimiterMemory, IRateLimiterOptions } from 'rate-limiter-flexible';
import { tooManyRequestsError } from '../../lib/errors';
import { getI18n } from 'i18n';
import { customLogger } from './custom-logger';
import { Env } from '../../types/common';

const i18n = getI18n('backend');

const getUsernameIPkey = (username?: string, ip?: string) => `${username}_${ip}`;

class RateLimiter extends RateLimiterMemory {
  public middleware(): MiddlewareHandler<Env> {
    return async (ctx, next) => {
      const ipAddr = ctx.req.header('x-forwarded-for');
      const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.json() : undefined;
      const user = ctx.get('user');
      const username = body?.email || user?.id;

      if (!ipAddr && !username) {
        return next();
      }

      const usernameIPkey = getUsernameIPkey(username, ipAddr);

      try {
        await this.consume(usernameIPkey);
      } catch (error) {
        customLogger('Too many requests', {
          usernameIPkey,
        });

        return ctx.json(tooManyRequestsError(i18n), 429);
      }

      await next();
    };
  }
}

export const rateLimiter = (options: IRateLimiterOptions) => new RateLimiter(options).middleware();

// Login rate limiter
const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 10;

const limiterSlowBruteByIP = new RateLimiterMemory({
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterMemory({
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60 * 24 * 90, // Store number for 90 days since first fail
  blockDuration: 60 * 60, // Block for 1 hour
});

export const signInRateLimiter = (): MiddlewareHandler<Env> => async (ctx, next) => {
  const ipAddr = ctx.req.header('x-forwarded-for') || '';
  const body = await ctx.req.json();

  if (!body.email) {
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
    customLogger('Too many requests (Login)', {
      usernameIPkey,
    });

    ctx.header('Retry-After', String(retrySecs));
    return ctx.json(tooManyRequestsError(i18n), 429);
  }

  await next();
};
