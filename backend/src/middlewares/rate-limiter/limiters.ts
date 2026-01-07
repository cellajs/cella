import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/lib/context';
import { registerMiddlewareDescription } from '#/lib/openapi-describer';
import { rateLimiter } from '#/middlewares/rate-limiter/core';

/**
 * Email spam limit for endpoints where emails are sent to others. Identifier: IP. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
 */
export const spamLimiter: MiddlewareHandler<Env> = rateLimiter('success', 'spam', ['ip']);

/**
 * Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 10 consecutive failed requests in 1 hour
 */
export const emailEnumLimiter: MiddlewareHandler<Env> = rateLimiter('failseries', 'email_enum', ['ip']);

/**
 * Password limiter to prevent users from guessing passwords. Blocks email or else ip for 30 min after 10 consecutive failed requests in 1 hour
 */
export const passwordLimiter: MiddlewareHandler<Env> = rateLimiter('failseries', 'password', ['email', 'ip']);

/**
 * Prevent brute force attacks by systematically trying tokens or secrets. Blocks IP for 30 minutes after 10 consecutive failed requests in 1 hour
 */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> => {
  const tokenRateLimiter = rateLimiter('failseries', `token_${tokenType}`, ['ip']);

  // Register the token rate limiter with OpenAPI documentation
  registerMiddlewareDescription({
    name: `token_${tokenType}Limiter`,
    middleware: tokenRateLimiter,
    category: 'rate-limit',
    label: `token_${tokenType} (10/h)`,
  });

  return tokenRateLimiter;
};

/**
 * Presigned URL rate limiter to prevent, falls back to IP address for anonymous requests
 */
export const presignedUrlLimiter: MiddlewareHandler<Env> = rateLimiter('limit', 'presigned_url', ['userId', 'ip'], {
  points: 2000, // 20 requests per hour
  duration: 60 * 60, // 1 hour window
  blockDuration: 60 * 15, // 15 minute block
});

/**
 * TOTP verification rate limiter to prevent brute force attacks on MFA codes
 */
export const totpVerificationLimiter: MiddlewareHandler<Env> = rateLimiter(
  'failseries',
  'totp_verification',
  ['email', 'ip'],
  {
    points: 5, // 5 attempts per hour
    duration: 60 * 60, // 1 hour window
    blockDuration: 60 * 30, // 30 minute block
  },
);

/**
 * Passkey challenge rate limiter to prevent challenge generation abuse
 */
export const passkeyChallengeLimiter: MiddlewareHandler<Env> = rateLimiter('limit', 'passkey_challenge', ['ip'], {
  points: 5, // 5 challenges per hour
  duration: 60 * 60, // 1 hour window
  blockDuration: 60 * 15, // 15 minute block
});

/**
 * Registers the ratelimmiters middleware for OpenAPI documentation.
 * This allows the middleware to be recognized and described in the API documentation.
 */
registerMiddlewareDescription({
  name: 'spamLimiter',
  middleware: spamLimiter,
  category: 'rate-limit',
  label: 'Spam (10/h)',
});

registerMiddlewareDescription({
  name: 'emailEnumLimiter',
  middleware: emailEnumLimiter,
  category: 'rate-limit',
  label: 'Email (5/h)',
});

registerMiddlewareDescription({
  name: 'passwordLimiter',
  middleware: passwordLimiter,
  category: 'rate-limit',
  label: 'Password (5/h)',
});

registerMiddlewareDescription({
  name: 'presignedUrlLimiter',
  middleware: presignedUrlLimiter,
  category: 'rate-limit',
  label: 'Presigned URL (20/h)',
});

registerMiddlewareDescription({
  name: 'totpVerificationLimiter',
  middleware: totpVerificationLimiter,
  category: 'rate-limit',
  label: 'TOTP Verification (5/h)',
});

registerMiddlewareDescription({
  name: 'passkeyChallengeLimiter',
  middleware: passkeyChallengeLimiter,
  category: 'rate-limit',
  label: 'Passkey Challenge (5/h)',
});
