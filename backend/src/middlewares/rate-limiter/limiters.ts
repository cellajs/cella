import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';
import { sendLockoutEmail } from '#/middlewares/rate-limiter/send-lockout-email';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';

/** Keyed per user when authenticated, so invite flows behind a shared NAT IP get their own budget. */
export const spamLimiter = rateLimiter('success', 'spam', [['userId', 'ip']], {
  // Count 204 delivery responses as success here only, so they cannot reset fail-series enumeration limits
  limits: { successStatusCodes: [200, 201, 204] },
  description: 'Max 10 requests/hour per user (per IP when anonymous) for email-sending endpoints',
});

export const emailEnumLimiter = rateLimiter('failseries', 'emailEnum', ['ip'], {
  limits: { points: 5 },
  description: 'Blocks IP for 30 min after 5 consecutive failures',
});

export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], {
    functionName: 'tokenLimiter',
    name: 'token',
    description: 'Blocks IP for 30 min after 10 consecutive token failures',
  });

export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', [['userId', 'ip']], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 60 * 15 },
  description: 'Max 2000 requests/hour per user for presigned URLs',
});

/** Keyed by IP only, since the body carries just the code; the lockout email reads the `confirm-mfa` cookie. */
const totpLimits = { points: 5, duration: 60 * 60, blockDuration: 60 * 30 };
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: totpLimits,
  description: 'Blocks IP for 30 min after 5 failed TOTP attempts',
  onBlock: (key, ctx) => sendLockoutEmail(key, 'totp-lockout', ctx, totpLimits),
});

export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 2, duration: 60 * 30, blockDuration: 0 },
  description: 'Max 2 magic link emails per 30 min per email address',
});

/** Generation uses a flat limit because it has no failure signal; verification has the brute-force limiter. */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 30 passkey challenges/hour per IP',
});

/**
 * Tenant-scoped points limiter capped at the global hourly ceiling; missing and zero tenant budgets use that ceiling.
 * @param cost Static request cost, or zero to derive it from the request.
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'userId'], {
    limits: {
      points: 5000, // Hard ceiling: no user can exceed this regardless of tenant config
      duration: 60 * 60,
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

/** Backpressure for the read fan-out one SSE notification triggers; a 429 rides the client's invalidate-and-backoff. */
export const syncReadLimiter = rateLimiter('limit', 'syncRead', [['userId', 'ip']], {
  limits: { points: 5000, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 5000 sync-driven reads/hour per user (delta lists, unseen counts)',
});

/** Bounds stream connection attempts per user. The client's 5-30s reconnect backoff stays far below this. */
export const streamConnectLimiter = rateLimiter('limit', 'streamConnect', [['userId', 'ip']], {
  limits: { points: 240, duration: 60 * 60, blockDuration: 60 * 5 },
  description: 'Max 240 SSE stream connects/hour per user',
});

/** Cost = length of the request body array. Attach to routes taking `{ ids: [...] }` or a top-level array body. */
export const bulkPointsLimiter = pointsLimiter(0);

/** Cost = 1 per request. Attach to single-entity create, update, and delete routes. */
export const singlePointsLimiter = pointsLimiter();
