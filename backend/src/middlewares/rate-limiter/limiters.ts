import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { rateLimiter } from '#/middlewares/rate-limiter/core';
import { bulkBodyLength } from '#/middlewares/rate-limiter/helpers';
import { isRecognizedBrowser } from '#/modules/auth/devices/operations/recognized-browser';
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
  name: 'Emails sent',
  description: "10 requests per hour for each user, or each IP address when not signed in. Failed requests don't count.",
});

/**
 * Address lookups per IP. check-email answers truthfully only a browser that signed in to the address before, so every
 * lookup counts, hits included: this bounds guessing on a shared browser. Past it, sign-in goes on without lookups.
 * A budget: it holds for the hour.
 */
export const emailEnumLimiter = rateLimiter('limit', 'emailEnum', ['ip'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 0 },
  name: 'Email lookups',
  description: '30 lookups per hour for each IP address. Every lookup counts, whatever the answer. Past it, sign-in goes on without lookups.',
});

/** Failed proofs per IP, one series per kind of proof (`tokenType`: a provider, a link type, `passkey`) under its own key prefix. */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], {
    limits: { successStatusCodes: proofSuccessStatusCodes },
    functionName: 'tokenLimiter',
    name: 'Failed sign-ins',
    description: '10 failed attempts per hour for each IP address and kind of sign-in, then blocked for 30 minutes. A success resets the count.',
  });

/** A budget, as API points are: it holds for the hour. One request signs up to 50 files, and the client keeps the links it got. */
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', [['userId', 'ip']], {
  limits: { points: 2000, duration: 60 * 60, blockDuration: 0 },
  name: 'File links',
  description: '2,000 requests per hour for each user. One request can cover up to 50 files.',
});

/**
 * A budget: each token signs one assembly of up to `maxFilesPerUpload` files. The uploader asks one as it opens and
 * one per assembly, and the offline upload service one per file it sends.
 */
export const uploadTokenLimiter = rateLimiter('limit', 'uploadToken', [['userId', 'ip']], {
  limits: { points: 300, duration: 60 * 60, blockDuration: 0 },
  name: 'Upload tokens',
  description: '300 tokens per hour for each user.',
});

/**
 * A budget: a browser registers when its user turns push on and when its push service rotates the subscription, so a
 * user on several devices stays far below it.
 */
export const pushSubscriptionLimiter = rateLimiter('limit', 'pushSubscription', ['userId'], {
  limits: { points: 30, duration: 60 * 60, blockDuration: 0 },
  name: 'Push subscriptions',
  description: '30 registrations per hour for each user.',
});

/** Keyed by IP, across accounts. Each account also has its own budget, with a lockout mail, in `verifyTotp`. */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: proofSuccessStatusCodes },
  name: 'Failed TOTP codes',
  description: '5 wrong codes per hour for each IP address, then blocked for 30 minutes. A correct code resets the count.',
});

/**
 * Keyed per account: a session guessing second factors is blocked whatever IP it uses; a proof that verifies clears
 * the series. A wrong factor answers 401 (404 for one the user does not hold); the 403 refusing an impersonation
 * guesses nothing and spends none of the user's attempts.
 */
export const stepUpLimiter = rateLimiter('failseries', 'stepUp', ['userId'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: [200, 201, 204], failStatusCodes: [401, 404] },
  name: 'Failed step-ups',
  description: '5 failed checks per hour for each account, then blocked for 30 minutes. A passed check resets the count.',
});

/**
 * Bounds the links one inbox receives, whatever IP asks. A browser that signed in to the address's account before (its
 * device cookie outlives sign-out) passes into `recognizedMagicLinkLimiter`, so its owner can sign in again and again.
 * The count stays a tally of other browsers' requests, alike for every address: no answer tells an address with an
 * account from one without.
 */
export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 3, duration: 60 * 30, blockDuration: 0 },
  refusalType: 'magic_link_recently_sent',
  exempt: (ctx, { email }) => !!email && isRecognizedBrowser(ctx, email),
  name: 'Magic links, new browser',
  description: '3 emails per 30 minutes for each address, when the browser has never signed in to it.',
});

/**
 * The inbox bound for the browsers `magicLinkLimiter` lets through: a copied device cookie is recognized from any IP.
 * Only a recognized browser counts or is refused here, and it already knows the address has an account.
 */
export const recognizedMagicLinkLimiter = rateLimiter('limit', 'recognizedMagicLink', ['email'], {
  limits: { points: 10, duration: 60 * 30, blockDuration: 0 },
  refusalType: 'magic_link_recently_sent',
  exempt: async (ctx, { email }) => !email || !(await isRecognizedBrowser(ctx, email)),
  name: 'Magic links, known browser',
  description: '10 emails per 30 minutes for each address, when the browser has signed in to it before.',
});

/**
 * Generation uses a flat limit because it has no failure signal; verification has the brute-force limiter. A pace, in a
 * short window: the key is an IP many people may share, and a challenge costs one row that expires.
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 5, blockDuration: 0 },
  name: 'Passkey challenges',
  description: '30 challenges per 5 minutes for each IP address.',
});

/**
 * Tenant-scoped points limiter capped at the global hourly ceiling; missing and zero tenant budgets use that ceiling.
 * @param cost Static request cost, or zero to derive it from the request.
 * @public
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'actorId'], {
    limits: { points: 5000, duration: 60 * 60, blockDuration: 0 },
    functionName: 'pointsLimiter',
    name: 'API points',
    description: `An hourly budget for each user or service account in a tenant: 1 point per request, 1 per item on bulk routes. Default ${defaultRestrictions().rateLimits.apiPointsPerHour.toLocaleString('en')} an hour, and each tenant can change it.`,
    getConsumePoints: cost > 0 ? () => cost : bulkBodyLength,
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
  name: 'Client metadata fetches',
  description: '60 fetches per minute for each IP address, then blocked for 1 minute.',
});

/** Per-second ceiling for API keys and access tokens: a runaway integration hits this long before the hourly points budget. */
export const serviceBurstLimiter = rateLimiter('limit', 'serviceBurst', ['actorId'], {
  limits: { points: 30, duration: 1, blockDuration: 0 },
  name: 'Request burst',
  description: '30 requests per second for each user or service account using an API key or access token.',
});

/** Per-second ceiling for MCP endpoint requests, a bucket of its own: the route a tool call runs charges the burst. */
export const mcpRequestLimiter = rateLimiter('limit', 'mcpRequest', ['actorId'], {
  limits: { points: 30, duration: 1, blockDuration: 0 },
  name: 'MCP requests',
  description: '30 requests per second for each user or service account.',
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
  name: 'Sync reads',
  description: '1,000 reads per 5 minutes for each user.',
});

/**
 * Bounds stream connection attempts per user, as a pace in a short window. A browser whose stream keeps dropping
 * reconnects about 20 times in 5 minutes at most (10 seconds up, 5 to 7 back off), and a user may have several.
 */
export const streamConnectLimiter = rateLimiter('limit', 'streamConnect', [['userId', 'ip']], {
  limits: { points: 60, duration: 60 * 5, blockDuration: 0 },
  name: 'Stream connections',
  description: '60 connection attempts per 5 minutes for each user.',
});

/**
 * Yjs over HTTP per user, pulls and pushes together, in place of API points: a socket costs none. A pace, in a window
 * as long as the client's longest backoff. An editing tab pulls every 10 seconds and posts one update at a time, the
 * next as soon as the last is answered while edits keep coming: up to one per keystroke on a slow connection.
 */
export const yjsHttpLimiter = rateLimiter('limit', 'yjsHttp', [['userId', 'ip']], {
  limits: { points: 600, duration: 60, blockDuration: 0 },
  name: 'Yjs over HTTP',
  description: '600 pulls and pushes per minute for each user, counted together.',
});

/** Cost = length of the request body array. Attach to routes taking `{ ids: [...] }` or a top-level array body. */
export const bulkPointsLimiter = pointsLimiter(0);

/** Cost = 1 per request. Attach to single-entity create, update, and delete routes. */
export const singlePointsLimiter = pointsLimiter();
