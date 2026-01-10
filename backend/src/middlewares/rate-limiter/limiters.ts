import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';

/**
 * Email spam limit for endpoints where emails are sent to others. Identifier: IP. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
 */
export const spamLimiter = rateLimiter('success', 'spam', ['ip']);

/**
 * Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 10 consecutive failed requests in 1 hour
 */
export const emailEnumLimiter = rateLimiter('failseries', 'emailEnum', ['ip']);

/**
 * Password limiter to prevent users from guessing passwords. Blocks email or else ip for 30 min after 10 consecutive failed requests in 1 hour
 */
export const passwordLimiter = rateLimiter('failseries', 'password', ['email', 'ip']);

/**
 * Prevent brute force attacks by systematically trying tokens or secrets. Blocks IP for 30 minutes after 10 consecutive failed requests in 1 hour
 */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], undefined, 'tokenLimiter');

/**
 * Presigned URL rate limiter to prevent, falls back to IP address for anonymous requests
 */
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', ['userId', 'ip'], {
  points: 2000, // 20 requests per hour
  duration: 60 * 60, // 1 hour window
  blockDuration: 60 * 15, // 15 minute block
});

/**
 * TOTP verification rate limiter to prevent brute force attacks on MFA codes
 */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['email', 'ip'], {
  points: 5, // 5 attempts per hour
  duration: 60 * 60, // 1 hour window
  blockDuration: 60 * 30, // 30 minute block
});

/**
 * Passkey challenge rate limiter to prevent challenge generation abuse
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  points: 5, // 5 challenges per hour
  duration: 60 * 60, // 1 hour window
  blockDuration: 60 * 15, // 15 minute block
});
