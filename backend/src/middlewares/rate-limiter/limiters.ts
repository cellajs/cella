import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';
import { defaultRestrictions } from '#/modules/tenants/tenant-restrictions';

/**
 * A proof that verified on a sign-in route: TOTP and passkey sign-in answer 204, a link or a provider callback 302. A
 * refusal that redirects counts by its own status (`errorStatus`), so here a 302 is a success. A route that answers 204
 * whatever the outcome (a mail sent or not) never takes these codes, so it cannot end a failure series.
 */
const proofSuccessStatusCodes = [200, 201, 204, 302];

/** Keyed per user when authenticated, so invite flows behind a shared NAT IP get their own budget. */
export const spamLimiter = rateLimiter('success', 'spam', [['userId', 'ip']], {
  limits: { successStatusCodes: [200, 201, 204] },
  description: 'Emails sent per user, per IP when anonymous: 10 per hour',
});

/**
 * Address lookups per IP. check-email answers truthfully only a browser that signed in to the address before, so every
 * lookup counts, hits included: this bounds guessing on a shared browser. Past it, sign-in goes on without lookups.
 * A budget: it holds for the hour.
 */
export const emailEnumLimiter = rateLimiter('limit', 'emailEnum', ['ip'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 0 },
  description: 'Address lookups per IP, hits included: 30 per hour',
});

export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], {
    limits: { successStatusCodes: proofSuccessStatusCodes },
    functionName: 'tokenLimiter',
    name: 'token',
    description: 'Failed link, callback and passkey sign-ins per IP: 10 per hour, then blocked for 30 minutes',
  });

/** A budget, as API points are: it holds for the hour. One request signs up to 50 files, and the client keeps the links it got. */
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', [['userId', 'ip']], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 0 },
  description: 'File link requests per user: 2000 per hour',
});

/** Keyed by IP, across accounts. Each account also has its own budget, with a lockout mail, in `verifyTotp`. */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: proofSuccessStatusCodes },
  description: 'Failed TOTP codes per IP: 5 per hour, then blocked for 30 minutes',
});

/**
 * Keyed per account: a session guessing second factors is blocked whatever IP it uses; a proof that verifies clears
 * the series. A wrong factor answers 401 (404 for one the user does not hold); the 403 refusing an impersonation
 * guesses nothing and spends none of the user's attempts.
 */
export const stepUpLimiter = rateLimiter('failseries', 'stepUp', ['userId'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: [200, 201, 204], failStatusCodes: [401, 404] },
  description: 'Failed step-up checks per account: 5 per hour, then blocked for 30 minutes',
});

export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 2, duration: 60 * 30, blockDuration: 0 },
  description: 'Magic link emails per address: 2 per 30 minutes',
});

/**
 * Generation uses a flat limit because it has no failure signal; verification has the brute-force limiter. A pace, in a
 * short window: the key is an IP many people may share, and a challenge costs one row that expires.
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 5, blockDuration: 0 },
  description: 'Passkey challenges per IP: 30 per 5 minutes',
});

/**
 * Tenant-scoped points limiter capped at the global hourly ceiling; missing and zero tenant budgets use that ceiling.
 * @param cost Static request cost, or zero to derive it from the request.
 * @public
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'actorId'], {
    limits: {
      points: 5000, // Hard ceiling: no user can exceed this regardless of tenant config
      duration: 60 * 60,
      blockDuration: 0, // Budget resets after the hour.
    },
    functionName: 'pointsLimiter',
    name: 'points',
    description: 'API points per actor in a tenant: 1 per request, 1 per item on bulk routes, up to the tenant hourly budget',
    getConsumePoints: cost > 0 ? undefined : bulkBodyLength,
    getPointsBudget: (ctx) => {
      const tenant = ctx.var.tenant;
      const budget = tenant?.restrictions?.rateLimits?.apiPointsPerHour;
      return budget ?? defaultRestrictions().rateLimits.apiPointsPerHour;
    },
  });

/**
 * Client metadata documents the authorization server fetches per IP: a client id it has not cached may be the URL of a
 * document on a host the requester picks. Charged by the provider's fetch hook (`chargeLimiter`), so requests that fetch
 * nothing, such as a known client's refresh, never count.
 */
export const clientMetadataFetchLimiter = rateLimiter('limit', 'clientMetadataFetch', ['ip'], {
  limits: { points: 60, duration: 60, blockDuration: 60 },
  description: 'Client metadata fetches per IP: 60 per minute, then blocked for 1 minute',
});

/** Per-second ceiling for API keys: a runaway integration hits this long before the hourly points budget. */
export const serviceBurstLimiter = rateLimiter('limit', 'serviceBurst', ['actorId'], {
  limits: { points: 30, duration: 1, blockDuration: 0 },
  description: 'Requests per actor with an API key or access token: 30 per second',
});

/** Per-second ceiling for MCP endpoint requests, a bucket of its own: the route a tool call runs charges the burst. */
export const mcpRequestLimiter = rateLimiter('limit', 'mcpRequest', ['actorId'], {
  limits: { points: 30, duration: 1, blockDuration: 0 },
  description: 'MCP requests per actor: 30 per second',
});

/**
 * Backpressure for the read fan-out one SSE notification triggers; a 429 rides the client's invalidate-and-backoff.
 * A pace, in a short window: a client catching up reads once per product type and organization, and one watching a
 * busy scope reads at each notification, so a spent key has to be back within minutes.
 * Counted in process: every list and delta read passes here, and a transaction on each cost as much as the read.
 */
export const syncReadLimiter = rateLimiter('limit', 'syncRead', [['userId', 'ip']], {
  limits: { points: 1000, duration: 60 * 5, blockDuration: 0 },
  countsInProcess: true,
  description: 'Sync reads per user: 1000 per 5 minutes',
});

/**
 * Bounds stream connection attempts per user, as a pace in a short window. A browser whose stream keeps dropping
 * reconnects about 20 times in 5 minutes at most (10 seconds up, 5 to 7 back off), and a user may have several.
 */
export const streamConnectLimiter = rateLimiter('limit', 'streamConnect', [['userId', 'ip']], {
  limits: { points: 60, duration: 60 * 5, blockDuration: 0 },
  description: 'Live update stream connections per user: 60 per 5 minutes',
});

/**
 * Yjs over HTTP per user, pulls and pushes together, in place of API points: a socket costs none. A pace, in a window
 * as long as the client's longest backoff. An editing tab pulls every 10 seconds and posts one update at a time, the
 * next as soon as the last is answered while edits keep coming: up to one per keystroke on a slow connection.
 */
export const yjsHttpLimiter = rateLimiter('limit', 'yjsHttp', [['userId', 'ip']], {
  limits: { points: 600, duration: 60, blockDuration: 0 },
  description: 'Yjs pulls and pushes per user: 600 per minute',
});

/** Cost = length of the request body array. Attach to routes taking `{ ids: [...] }` or a top-level array body. */
export const bulkPointsLimiter = pointsLimiter(0);

/** Cost = 1 per request. Attach to single-entity create, update, and delete routes. */
export const singlePointsLimiter = pointsLimiter();
