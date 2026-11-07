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

/** Keyed per actor when authenticated, so invite flows behind a shared NAT IP get their own budget. */
export const spamLimiter = rateLimiter('success', 'spam', [['actorId', 'ip']], {
  limits: { successStatusCodes: [200, 201, 204] },
  name: 'Emails sent',
  description: 'Mails sent for each user, or for each IP address when not signed in. A failed request does not count.',
});

/**
 * Address lookups per IP. check-email answers truthfully only a browser that signed in to the address before, so every
 * lookup counts, hits included: this bounds guessing on a shared browser. Past it, sign-in goes on without lookups.
 * A budget: it holds for the hour.
 */
export const emailEnumLimiter = rateLimiter('limit', 'emailEnum', ['ip'], {
  limits: { points: 30, duration: 60 * 60 },
  name: 'Email lookups',
  description: 'Lookups for each IP address. Every lookup counts, whatever the answer; past the budget, sign-in goes on without lookups.',
});

/** Demos taken per IP a day: each one is a tenant with an account, built on the spot. */
export const demoLimiter = rateLimiter('limit', 'demo', ['ip'], {
  limits: { points: 5, duration: 24 * 60 * 60 },
  name: 'Demos',
  description: 'Demos taken from each IP address a day; a browser that holds a demo gets it back without taking another.',
});

/** Failed proofs per IP, one series per kind of proof (`tokenType`: a provider, a link type, `passkey`) under its own key prefix. */
export const tokenLimiter = (tokenType: string): MiddlewareHandler<Env> =>
  rateLimiter('failseries', `token_${tokenType}`, ['ip'], {
    limits: { successStatusCodes: proofSuccessStatusCodes },
    functionName: 'tokenLimiter',
    name: 'Failed sign-ins',
    description: 'Failed attempts for each IP address and kind of sign-in. A success resets the count.',
  });

/**
 * A pace per IP for the one-click unsubscribe (RFC 8058), counted in process. A mail provider posts every recipient's
 * one-click from a few addresses, so every answer counts alike and one recipient's dead link never refuses another's
 * valid one; the link's HMAC is what guessing runs into.
 */
export const oneClickUnsubscribeLimiter = rateLimiter('limit', 'oneClickUnsubscribe', ['ip'], {
  limits: { points: 1000, duration: 60 * 5 },
  countsInProcess: true,
  name: 'One-click unsubscribes',
  description: "Requests for each IP address, whatever the answer: a mail provider posts many recipients' unsubscribes from one address.",
});

/** A budget, as API points are: it holds for the hour. One request signs up to 50 files, and the client keeps the links it got. */
export const presignedUrlLimiter = rateLimiter('limit', 'presignedUrl', [['actorId', 'ip']], {
  limits: { points: 2000, duration: 60 * 60 },
  name: 'File links',
  description: 'Requests for each user or service account. One request can cover up to 50 files.',
});

/**
 * A budget: each token signs one assembly of up to `maxFilesPerUpload` files. The uploader asks one as it opens and
 * one per assembly, and the offline upload service one per file it sends.
 */
export const uploadTokenLimiter = rateLimiter('limit', 'uploadToken', [['actorId', 'ip']], {
  limits: { points: 300, duration: 60 * 60 },
  name: 'Upload tokens',
  description: 'Tokens for each user or service account.',
});

/**
 * A budget: a browser registers when its user turns push on and when its push service rotates the subscription, so a
 * user on several devices stays far below it.
 */
export const pushSubscriptionLimiter = rateLimiter('limit', 'pushSubscription', ['actorId'], {
  limits: { points: 30, duration: 60 * 60 },
  name: 'Push subscriptions',
  description: 'Registrations for each user.',
});

/** Keyed by IP, across accounts. Each account also has its own budget, with a lockout mail, in `verifyTotp`. */
export const totpVerificationLimiter = rateLimiter('failseries', 'totpVerification', ['ip'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: proofSuccessStatusCodes },
  name: 'Failed TOTP codes',
  description: 'Wrong codes for each IP address. A correct code resets the count.',
});

/**
 * Keyed per account: a session guessing second factors is blocked whatever IP it uses; a proof that verifies clears
 * the series. A wrong factor answers 401 (404 for one the user does not hold).
 */
export const stepUpLimiter = rateLimiter('failseries', 'stepUp', ['actorId'], {
  limits: { points: 5, duration: 60 * 60, blockDuration: 60 * 30, successStatusCodes: [200, 201, 204], failStatusCodes: [401, 404] },
  name: 'Failed step-ups',
  description: 'Failed checks for each account. A passed check resets the count.',
});

/**
 * Bounds the links one inbox receives, whatever IP asks. A browser that signed in to the address's account before (its
 * device cookie outlives sign-out) passes into `recognizedMagicLinkLimiter`, so its owner can sign in again and again.
 * The count stays a tally of other browsers' requests, alike for every address: no answer tells an address with an
 * account from one without.
 */
export const magicLinkLimiter = rateLimiter('limit', 'magicLink', ['email'], {
  limits: { points: 3, duration: 60 * 30 },
  refusalType: 'magic_link_recently_sent',
  exempt: (ctx, { email }) => !!email && isRecognizedBrowser(ctx, email),
  name: 'Magic links, new browser',
  description: 'Emails for each address, when the browser has never signed in to it.',
});

/**
 * The inbox bound for the browsers `magicLinkLimiter` lets through: a copied device cookie is recognized from any IP.
 * Only a recognized browser counts or is refused here, and it already knows the address has an account.
 */
export const recognizedMagicLinkLimiter = rateLimiter('limit', 'recognizedMagicLink', ['email'], {
  limits: { points: 10, duration: 60 * 30 },
  refusalType: 'magic_link_recently_sent',
  exempt: async (ctx, { email }) => !email || !(await isRecognizedBrowser(ctx, email)),
  name: 'Magic links, known browser',
  description: 'Emails for each address, when the browser has signed in to it before.',
});

/**
 * Generation uses a flat limit because it has no failure signal; verification has the brute-force limiter. A pace, in a
 * short window: the key is an IP many people may share, and a challenge costs one row that expires.
 */
export const passkeyChallengeLimiter = rateLimiter('limit', 'passkeyChallenge', ['ip'], {
  limits: { points: 30, duration: 60 * 5 },
  name: 'Passkey challenges',
  description: 'Challenges for each IP address.',
});

/**
 * Tenant-scoped points limiter capped at the global hourly ceiling; missing and zero tenant budgets use that ceiling.
 * @param cost Static request cost, or zero to derive it from the request.
 * @public
 */
export const pointsLimiter = (cost = 1) =>
  rateLimiter('limit', 'apiPoints', ['tenantId', 'actorId'], {
    limits: { points: 5000, duration: 60 * 60 },
    functionName: 'pointsLimiter',
    name: 'API points',
    description: `Points for each user or service account in a tenant: 1 per request, 1 per item on a bulk route. A tenant starts at ${defaultRestrictions().rateLimits.apiPointsPerHour.toLocaleString('en')} an hour, which a system admin can raise up to the ceiling shown.`,
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
  limits: { points: 60, duration: 60 },
  name: 'Client metadata fetches',
  description: 'Fetches for each IP address.',
});

/**
 * Per-second ceiling for API keys and access tokens, run by `serviceGuard` for every machine caller: a runaway
 * integration hits this long before the hourly points budget.
 */
export const serviceBurstLimiter = rateLimiter('limit', 'serviceBurst', ['actorId'], {
  limits: { points: 30, duration: 1 },
  name: 'Request burst',
  description: 'Requests for each user or service account using an API key or access token.',
});

/** Per-second ceiling for MCP endpoint requests, a bucket of its own: the route a tool call runs charges the burst. */
export const mcpRequestLimiter = rateLimiter('limit', 'mcpRequest', ['actorId'], {
  limits: { points: 30, duration: 1 },
  name: 'MCP requests',
  description: 'Requests for each user or service account.',
});

/**
 * The pace of every read: `createXRoute` mounts it on each GET route that declares no limiter of its own, so one
 * client cannot hold the event loop with reads. It is also the backpressure for the read fan-out one SSE notification
 * triggers; a 429 rides the client's invalidate-and-backoff. A pace, in a short window: a client catching up reads once
 * per product type and organization, and one watching a busy scope reads at each notification, so a spent key has to
 * be back within minutes. Counted in process: a transaction on each read would cost as much as the read.
 */
export const readLimiter = rateLimiter('limit', 'read', [['actorId', 'ip']], {
  limits: { points: 1000, duration: 60 * 5 },
  countsInProcess: true,
  name: 'Reads',
  description: 'Reads for each user or service account, or for each IP address when not signed in.',
});

/**
 * Bounds stream connection attempts per user, as a pace in a short window. A browser whose stream keeps dropping
 * reconnects about 20 times in 5 minutes at most (10 seconds up, 5 to 7 back off), and a user may have several.
 */
export const streamConnectLimiter = rateLimiter('limit', 'streamConnect', [['actorId', 'ip']], {
  limits: { points: 60, duration: 60 * 5 },
  name: 'Stream connections',
  description: 'Connection attempts for each user.',
});

/**
 * Yjs over HTTP per user, pulls and pushes together, in place of API points: a socket costs none. A pace, in a window
 * as long as the client's longest backoff. An editing tab pulls every 10 seconds and posts one update at a time, the
 * next as soon as the last is answered while edits keep coming: up to one per keystroke on a slow connection.
 */
export const yjsHttpLimiter = rateLimiter('limit', 'yjsHttp', [['actorId', 'ip']], {
  limits: { points: 600, duration: 60 },
  name: 'Yjs over HTTP',
  description: 'Pulls and pushes for each user, counted together.',
});

/** Cost = length of the request body array. Attach to routes taking `{ ids: [...] }` or a top-level array body. */
export const bulkPointsLimiter = pointsLimiter(0);

/** Cost = 1 per request. Attach to single-entity create, update, and delete routes. */
export const singlePointsLimiter = pointsLimiter();
