import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';

/**
 * Email spam limit for endpoints where emails are sent to others. Identifier: IP. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
 */
export const spamLimiter = rateLimiter('success', 'spam', ['ip'], {
  description: 'Max 10 requests/hour per IP for email-sending endpoints',
});

/**
 * Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 10 consecutive failed requests in 1 hour
 */
export const emailEnumLimiter = rateLimiter('failseries', 'emailEnum', ['ip'], {
  description: 'Blocks IP for 30 min after 10 consecutive failures',
});

/**
 * Password limiter to prevent users from guessing passwords. Blocks email or else ip for 30 min after 10 consecutive failed requests in 1 hour
 */
export const passwordLimiter = rateLimiter('failseries', 'password', ['email', 'ip'], {
  description: 'Blocks email/IP for 30 min after 10 consecutive failures',
});

/**
 * Prevent brute force attacks by systematically trying tokens or secrets. Blocks IP for 30 minutes after 10 consecutive failed requests in 1 hour
 */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], {
    functionName: 'tokenLimiter',
    name: 'token',
    description: 'Blocks IP for 30 min after 10 consecutive token failures',
  });

/**
 * Presigned URL rate limiter to prevent abuse, falls back to IP address for anonymous requests
 */
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', ['userId', 'ip'], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 2000 requests/hour per user/IP for presigned URLs',
});

/**
 * TOTP verification rate limiter to prevent brute force attacks on MFA codes
 */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['email', 'ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30 },
  description: 'Blocks for 30 min after 5 failed TOTP attempts',
});

/**
 * Passkey challenge rate limiter to prevent challenge generation abuse
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 5 passkey challenges/hour per IP',
});
