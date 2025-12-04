import type { Context } from 'hono';
import { type IRateLimiterPostgresOptions, RateLimiterMemory, RateLimiterPostgres, type RateLimiterRes } from 'rate-limiter-flexible';
import { db } from '#/db/db';
import { env } from '#/env';
import { Env, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import { defaultOptions } from '#/middlewares/rate-limiter/core';
import { Identifiers, RateLimitIdentifier } from '#/middlewares/rate-limiter/types';
import { getIp } from '#/utils/get-ip';

/**
 * Get instance of rate limiter with correct store
 */
export const getRateLimiterInstance = (options: Omit<IRateLimiterPostgresOptions, 'storeClient'>) => {
  // tableName is always set to defaultOptions.tableName
  const enforcedOptions = {
    ...options,
    tableName: defaultOptions.tableName,
  };

  return env.PGLITE
    ? new RateLimiterMemory(enforcedOptions)
    : new RateLimiterPostgres({
        ...enforcedOptions,
        storeClient: db.$client,
      });
};

/**
 * Rate limit Error response
 */
export const rateLimitError = (ctx: Context<Env>, limitState: RateLimiterRes, rateLimitKey: string) => {
  ctx.header('Retry-After', getRetryAfter(limitState.msBeforeNext));
  throw new AppError({ status: 429, type: 'too_many_requests', severity: 'warn', meta: { rateLimitKey } });
};

/**
 * Get Retry-After header value
 */
export const getRetryAfter = (ms: number) => Math.round(ms / 1000).toString() || '1';

/**
 * Extract email from multiple sources: body, query, params, headers
 */
export const extractIdentifiers = async (ctx: Context<Env>, identifiersToExtract: RateLimitIdentifier[]): Promise<Identifiers> => {
  const results: Identifiers = {
    email: null,
    ip: null,
    userId: null,
  };

  for (const identifier of identifiersToExtract) {
    switch (identifier) {
      case 'email': {
        let email: string | null = null;

        // JSON body
        if (ctx.req.header('content-type')?.includes('application/json')) {
          try {
            const contentLength = ctx.req.header('content-length');
            if (contentLength && contentLength !== '0') {
              const body = (await ctx.req.raw.clone().json()) as { email?: string };
              if (body.email) {
                email = body.email;
                break;
              }
            }
          } catch {}
        }

        // Query
        const queryEmail = ctx.req.query('email');
        if (queryEmail) {
          email = queryEmail;
          break;
        }

        // Params
        const paramEmail = ctx.req.param('email');
        if (paramEmail) {
          email = paramEmail;
          break;
        }

        // Headers
        const headerEmail = ctx.req.header('x-user-email');
        if (headerEmail) {
          email = headerEmail;
        }

        results.email = email;
        break;
      }

      case 'ip': {
        results.ip = getIp(ctx);
        break;
      }
      case 'userId': {
        const user = getContextUser();
        if (user) results.userId = user.id;
        break;
      }
    }
  }

  return results;
};
