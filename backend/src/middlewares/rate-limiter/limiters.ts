import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { baseDb as db } from '#/db/db';
import { usersTable } from '#/db/schema/users';
import { defaultRestrictions } from '#/db/utils/tenant-restrictions';
import type { Env } from '#/lib/context';
import { sendAccountSecurityEmail } from '#/lib/send-account-security-email';
import { defaultOptions, rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';

/** Extract email from rate limit key like "email:user@example.com" or "email:user@example.comip:1.2.3.4" */
const emailFromKey = (key: string) => {
  const match = key.match(/email:([^\s]+?)(?:ip:|$)/);
  return match?.[1] ?? null;
};

/** Look up user by email and send a lockout notification */
const sendLockoutEmail = (rateLimitKey: string, type: 'wrong-password-lockout' | 'totp-lockout') => {
  const email = emailFromKey(rateLimitKey);
  if (!email) return;

  const duration = Math.round(defaultOptions.blockDuration / 60);

  db.select({ email: usersTable.email, name: usersTable.name, language: usersTable.language })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)
    .then(([user]) => {
      if (user)
        sendAccountSecurityEmail(user, type, { attempts: String(defaultOptions.points), duration: String(duration) });
    })
    .catch(() => {});
};

/**
 * Email spam limit for endpoints where emails are sent to others. Identifier: IP. Max 10 requests per hour. For sign up with password, reset password, public requests etc.
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
 * Password limiter to prevent users from guessing passwords. Blocks email or else ip for 30 min after 10 consecutive failed requests in 1 hour
 */
export const passwordLimiter = rateLimiter('failseries', 'password', ['email', 'ip'], {
  description: 'Blocks email/IP for 30 min after 10 consecutive failures',
  onBlock: (key) => sendLockoutEmail(key, 'wrong-password-lockout'),
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
  onBlock: (key) => sendLockoutEmail(key, 'totp-lockout'),
});

/**
 * Passkey challenge rate limiter to prevent challenge generation abuse
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 5 passkey challenges/hour per IP',
});

/**
 * Points-weighted rate limiter factory for tenant-scoped routes.
 * Consumes `cost` points per request (default: 1). Budget is read from
 * `ctx.var.tenant.restrictions.rateLimits.apiPointsPerHour`, falling back
 * to the global default when no tenant is available on the context.
 *
 * Global safety-net ceiling: 5000 points/hour (static `limits.points`).
 *
 * @param cost - Static cost per request, or 0 to use dynamic `getConsumePoints`.
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'userId'], {
    limits: {
      points: 5000, // Hard ceiling: no user can exceed this regardless of tenant config
      duration: 60 * 60, // 1-hour window
      blockDuration: 0, // No additional block time — budget simply resets after the hour
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
