import { RateLimiterMemory, RateLimiterPostgres } from 'rate-limiter-flexible';

export type RateLimitMode = 'limit' | 'success' | 'fail' | 'failseries';
export type RateLimitIdentifier = 'ip' | 'email';
export type Identifiers = Record<RateLimitIdentifier, string | null>;

type LimiterStatusLists = {
  successStatusCodes?: number[];
  failStatusCodes?: number[];
  ignoredStatusCodes?: number[];
};

export type RateLimitOptions = Partial<RateLimiterPostgres> | (Partial<RateLimiterMemory> & LimiterStatusLists);
