import type { Env } from '#/lib/context';
import type { MiddlewareHandler } from 'hono';
import { rateLimiter } from './core';

/**
 * Email spam limit for endpoints where emails are sent to others. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
 */
export const spamLimiter: MiddlewareHandler<Env> = rateLimiter('success', 'spam', ['ip'], { points: 10, blockDuration: 60 * 60 });

/**
 * Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 5 consecutive failed requests in 1 hour
 */
export const emailEnumLimiter: MiddlewareHandler<Env> = rateLimiter('failseries', 'email_enum', ['ip']);

/**
 * Password limiter to prevent users from guessing passwords. Blocks user sign in for 30 min after 5 consecutive failed requests in 1 hour
 */
export const passwordLimiter: MiddlewareHandler<Env> = rateLimiter('failseries', 'password', ['ip', 'email']);

/**
 * Prevent brute force attacks by systematically trying tokens or secrets. Blocks IP for 30 minutes after 5 consecutive failed requests in 1 hour
 */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> => rateLimiter('failseries', `token_${tokenType}`, ['ip']);
