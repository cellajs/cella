import { type IRateLimiterPostgresOptions, RateLimiterMemory, RateLimiterPostgres } from 'rate-limiter-flexible';

import { env } from '#/../env';
import { db } from '#/db/db';
import { defaultOptions } from '#/middlewares/rate-limiter';

// Get instance of rate limiter with correct store
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

export const getUsernameIPkey = (ip: string, username?: string) => {
  if (!username) return ip;
  return `${ip}_${username}`;
};

export const getRetryAfter = (ms: number) => Math.round(ms / 1000).toString() || '1';
