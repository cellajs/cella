import { MiddlewareHandler } from 'hono';

import { IRateLimiterOptions, RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { tooManyRequestsError } from '../../lib/errors';

import { getI18n } from 'i18n';

import { customLogger } from '../../lib/custom-logger';
import { Env } from '../../types/common';

const i18n = getI18n('backend');

const getUsernameIPkey = (username?: string, ip?: string) => `${username}_${ip}`;

// TODO: Currently uses memory store, eventually we need redis
class RateLimiter extends RateLimiterMemory {
  public middleware(mode: 'success' | 'fail' | 'limit' = 'limit'): MiddlewareHandler<Env> {
    if (mode === 'success' || mode === 'fail') {
      this.points = this.points - 1;
    }

    return async (ctx, next) => {
      const ipAddr = ctx.req.header('x-forwarded-for');
      const body = ctx.req.header('content-type') === 'application/json' ? await ctx.req.raw.clone().json() : undefined;
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
        customLogger('Too many requests', {
          usernameIPkey,
        });

        ctx.header('Retry-After', String(retrySecs));
        return ctx.json(tooManyRequestsError(i18n), 429);
      }

      if (mode === 'limit') {
        try {
          await this.consume(usernameIPkey);
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) {
            customLogger('Too many requests (Limit)', {
              usernameIPkey,
            });

            ctx.header('Retry-After', String(Math.round(rlRejected.msBeforeNext / 1000) || 1));
            return ctx.json(tooManyRequestsError(i18n), 429);
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

export const rateLimiter = (options: IRateLimiterOptions, mode: 'success' | 'fail' | 'limit' = 'limit') => new RateLimiter(options).middleware(mode);

// Sign in rate limiter
const maxWrongAttemptsByIPperDay = 100;
const maxConsecutiveFailsByUsernameAndIP = 5;

const limiterSlowBruteByIP = new RateLimiterMemory({
  keyPrefix: 'login_fail_ip_per_day',
  points: maxWrongAttemptsByIPperDay,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24, // Block for 1 day, if 100 wrong attempts per day
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterMemory({
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: maxConsecutiveFailsByUsernameAndIP,
  duration: 60 * 60, // Store number for 1 hour since first fail
  blockDuration: 60 * 5, // Block for 5 min
});

export const signInRateLimiter = (): MiddlewareHandler<Env> => async (ctx, next) => {
  const ipAddr = ctx.req.header('x-forwarded-for') || '';
  const body = await ctx.req.raw.clone().json();

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

  await limiterSlowBruteByIP.consume(ipAddr);

  await next();

  if (ctx.res.status === 401) {
    try {
      await limiterConsecutiveFailsByUsernameAndIP.consume(usernameIPkey);
    } catch (error) {
      customLogger('Too many requests (Limit)', {
        usernameIPkey,
      });

      return ctx.json(tooManyRequestsError(i18n), 429);
    }
  } else {
    await limiterConsecutiveFailsByUsernameAndIP.delete(usernameIPkey);
  }
};
