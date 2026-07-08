import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';
import { sendLockoutEmail } from '#/middlewares/rate-limiter/helpers/send-lockout-email';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';

// TODO [#04] spam limiter might block legitimate users behind a shared IP. Can it use user id and fallback to IP?
/**
 * Email spam limit for endpoints where emails are sent to others. Identifier: IP. Max 10 requests per hour. For sign up, public requests etc.
 */
export const spamLimiter = rateLimiter('success', 'spam', ['ip'], {
  description: 'Max 10 requests/hour per IP for email-sending endpoints',
});

/**
 * Email enumeration limiter to prevent users from guessing emails. Blocks IP for 30 min after 5 consecutive failed requests in 1 hour
 */
export const emailEnumLimiter = rateLimiter('failseries', 'emailEnum', ['ip'], {
  limits: { points: 5 },
  description: 'Blocks IP for 30 min after 5 consecutive failures',
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
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', ['userId'], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 2000 requests/hour per user for presigned URLs',
});

/**
 * TOTP verification rate limiter to prevent brute force attacks on MFA codes
 */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30 },
  description: 'Blocks IP for 30 min after 5 failed TOTP attempts',
  onBlock: (key) => sendLockoutEmail(key, 'totp-lockout'),
});

/**
 * Magic link rate limiter to prevent abuse. Max 2 emails per 30 minutes per email address.
 */
export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 2, duration: 60 * 30, blockDuration: 0 },
  description: 'Max 2 magic link emails per 30 min per email address',
});

/**
 * Passkey challenge rate limiter to prevent challenge generation abuse.
 * Higher limit because conditional mediation (passkey autofill) generates
 * a challenge on every sign-in form mount.
 *
 * Deliberately a flat 'limit', not a 'failseries': challenge generation always
 * succeeds so there is no failure signal here. Brute force is bounded by the
 * failseries `tokenLimiter('passkey')` on the verification route; this limiter
 * only bounds the email -> credentialIds lookup (enumeration surface) and
 * request volume.
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 30 passkey challenges/hour per IP',
});

/**
 * Points-weighted rate limiter factory for tenant-scoped routes.
 * Consumes `cost` points per request (default: 1). Budget is read from
 * `ctx.var.tenant.restrictions.rateLimits.apiPointsPerHour`, falling back
 * to the global default when no tenant is available on the context.
 *
 * Global safety-net ceiling: 5000 points/hour (static `limits.points`).
 *
 * @internal Use `bulkPointsLimiter` or `singlePointsLimiter` for common cases, or create custom limiters with different costs as needed.
 * @param cost - Static cost per request, or 0 to use dynamic `getConsumePoints`.
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'userId'], {
    limits: {
      points: 5000, // Hard ceiling: no user can exceed this regardless of tenant config
      duration: 60 * 60, // 1-hour window
      blockDuration: 0, // Budget resets after the hour.
    },
    functionName: 'pointsLimiter',
    name: 'points',
    description: `Consumes ${cost || 'dynamic'} API point(s) per request against per-tenant hourly budget`,
    getConsumePoints: cost > 0 ? undefined : bulkBodyLength,
    getPointsBudget: (ctx) => {
      const tenant = ctx.var.tenant;
      const budget = tenant?.restrictions?.rateLimits?.apiPointsPerHour;
      return budget ?? defaultRestrictions().rateLimits.apiPointsPerHour;
    },
  });

/**
 * Bulk-operation points limiter: cost = length of the request body array.
 * Attach to any route that accepts `{ ids: [...] }` or a top-level array body.
 */
export const bulkPointsLimiter = pointsLimiter(0);

/**
 * Single-write points limiter: cost = 1 per request.
 * Attach to single-entity create, update, and delete routes.
 */
export const singlePointsLimiter = pointsLimiter();
