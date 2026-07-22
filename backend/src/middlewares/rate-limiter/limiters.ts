import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';
import { sendLockoutEmail } from '#/middlewares/rate-limiter/send-lockout-email';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';

/**
 * Email spam limit for endpoints where emails are sent to others. Max 10 requests per hour.
 * Keyed per user when authenticated, so invite flows behind a shared office/NAT IP get their
 * own budget (and rotating IPs does not create fresh buckets); falls back to IP for anonymous
 * requests (sign up, public requests etc.).
 */
export const spamLimiter = rateLimiter('success', 'spam', [['userId', 'ip']], {
  // Count 204 delivery responses as success for magic-link throttling.
  // Keep it local so 204 responses cannot reset unrelated fail-series enumeration limits.
  limits: { successStatusCodes: [200, 201, 204] },
  description: 'Max 10 requests/hour per user (per IP when anonymous) for email-sending endpoints',
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
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', [['userId', 'ip']], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 2000 requests/hour per user for presigned URLs',
});

/**
 * TOTP verification rate limiter to prevent brute force attacks on MFA codes.
 * The key is IP-only (the body carries just the code), so the lockout email resolves the
 * pending user from the request's `confirm-mfa` cookie via ctx.
 */
const totpLimits = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: totpLimits,
  description: 'Blocks IP for 30 min after 5 failed TOTP attempts',
  onBlock: (key, ctx) => sendLockoutEmail(key, 'totp-lockout', ctx, totpLimits),
});

/**
 * Magic link rate limiter to prevent abuse. Max 2 emails per 30 minutes per email address.
 */
export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 2, duration: 60 * 30, blockDuration: 0 },
  description: 'Max 2 magic link emails per 30 min per email address',
});

/**
 * Bounds passkey challenge lookups while allowing frequent conditional-mediation requests.
 * Verification has the brute-force limiter; generation uses a flat limit because it has no
 * failure signal.
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 30 passkey challenges/hour per IP',
});

/**
 * Builds a tenant-scoped points limiter, capped at the global 5,000-point hourly ceiling.
 * Missing and zero tenant budgets use that ceiling.
 * @param cost Static request cost, or zero to derive it from the request.
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
 * Sync-driven read limiter (backpressure, not throughput): bounds the fan-out read
 * endpoints (delta list fetches and unseen-count reads) that every SSE notification can
 * trigger across the whole online audience. Generous by design (the fetch prioritizer already
 * merges and spreads fetches); a 429 here rides the client's existing fetch-failure fallback
 * (targeted invalidation + backoff). Attach to product list ops and unseen counts.
 */
export const syncReadLimiter = rateLimiter('limit', 'syncRead', [['userId', 'ip']], {
  limits: { points: 5000, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 5000 sync-driven reads/hour per user (delta lists, unseen counts)',
});

/**
 * SSE connect limiter: bounds stream connection attempts per user. The client's reconnect
 * backoff (5-30s + circuit breaker) stays far below this; only a runaway reconnect loop or
 * deliberate abuse reaches it.
 */
export const streamConnectLimiter = rateLimiter('limit', 'streamConnect', [['userId', 'ip']], {
  limits: { points: 240, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 240 SSE stream connects/hour per user',
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
