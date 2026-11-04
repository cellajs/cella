import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { extractIdentifiers, getRateLimiterInstance, refuseRateLimited, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { adoptDbCount, maxWindowMs, takeDebt, tryFastConsume, windowSecondsLeft } from '#/middlewares/rate-limiter/points-cache';
import { reserveTiers, settleTiers, slowTier } from '#/middlewares/rate-limiter/tiers';
import type {
  Outcome,
  RateLimiterHandler,
  RateLimiterOpts,
  RateLimitKeyPart,
  RateLimitMode,
  RateLimitPolicy,
  Tier,
} from '#/middlewares/rate-limiter/types';

const defaultOptions = {
  points: 10,
  duration: 60 * 60,
  blockDuration: 60 * 30,
  successStatusCodes: [200, 201],
  failStatusCodes: [401, 403, 404],
  ignoredStatusCodes: [429],
};

/**
 * Builds a route rate limiter. `limit` counts every request, `success` and `fail` only matching ones, `failseries`
 * resets after a success. Every mode counts an attempt before the handler runs, `success` and the fail modes give it
 * back unless it had the counted outcome, so a parallel burst reaches the handler at most `points` times. A spent
 * `limit` or `success` budget refuses until its window ends; a fail mode blocks for `blockDuration` from the failure
 * that spent it, and also counts failures in a 24-hour bucket that catches slow brute-force attempts. A pace, on a
 * route whose client retries with backoff, takes a window of minutes.
 * @param mode - Result mode that controls point consumption.
 * @param key - Rate-limit namespace.
 * @param identifiers - Key parts or fallback chains composing the subject identifier.
 * @param opts - Limits and middleware metadata.
 */
export const rateLimiter = (mode: RateLimitMode, key: string, identifiers: RateLimitKeyPart[], opts?: RateLimiterOpts): RateLimiterHandler => {
  const { limits, functionName, name, description, refusalType, exempt, getConsumePoints, getPointsBudget, countsInProcess } = opts ?? {};
  const config = { ...defaultOptions, ...limits };
  const keyPrefix = `${key}_${mode}`;
  const fastPath = mode === 'limit' && (countsInProcess || getPointsBudget !== undefined);
  /** The window the in-process counter keeps for a key: the limiter's own, up to the hour the counter keeps an idle key. */
  const windowMs = config.duration * 1000;
  if (fastPath && windowMs > maxWindowMs) throw new Error(`${keyPrefix}: counting in process needs a window of at most an hour`);
  if (mode === 'limit' && limits?.blockDuration) throw new Error(`${keyPrefix}: a limit refuses until its window ends; a block needs a fail mode`);
  const isFailMode = mode === 'fail' || mode === 'failseries';
  const store = getRateLimiterInstance({ ...config, keyPrefix });
  const policy: RateLimitPolicy = { mode, points: config.points, duration: config.duration };
  if (isFailMode) policy.blockDuration = config.blockDuration || config.duration;
  /** The buckets a reserved attempt counts in: the route's own and, behind a failure budget, the 24-hour one. */
  const tiers: Tier[] =
    mode === 'limit' ? [] : [{ store, limits: config, counts: isFailMode ? 'fail' : 'success', resetsOnSuccess: mode === 'failseries' }];
  if (isFailMode) tiers.push(slowTier(keyPrefix));

  const handler = xMiddleware(
    { functionName: functionName ?? `${key}Limiter`, type: 'x-rate-limiter', errors: [400, 429], name: name ?? key, description, policy },
    async (ctx, next) => {
      const extractedIdentifiers = await extractIdentifiers(ctx, identifiers.flat());

      // Each key part contributes one segment; fallback chains use their first available identity
      let rateLimitKey = '';

      for (const part of identifiers) {
        const chain = Array.isArray(part) ? part : [part];
        const identifier = chain.find((id) => extractedIdentifiers[id]);

        if (!identifier) {
          // Chains and bare ip/email must resolve; bare actorId and tenantId are skipped, and an empty key is refused below
          if (Array.isArray(part) || part === 'ip' || part === 'email') {
            throw new AppError(400, 'invalid_request', 'warn');
          }
          continue;
        }

        // An IP (by its /64 for IPv6, so rotation inside it cannot evade a limit) or an address counts under its pseudonym
        rateLimitKey += subjectSegment(identifier, extractedIdentifiers[identifier] as string);
      }

      // An empty key would share one bucket across all traffic (a userId-keyed limiter on a public route): misconfiguration
      if (!rateLimitKey) throw new AppError(400, 'invalid_request', 'warn');

      if (exempt && (await exempt(ctx, extractedIdentifiers))) {
        await next();
        return;
      }

      if (mode === 'limit') {
        // Clamp tenant budgets without mutating the shared prefix limiter; a zero tenant budget uses the global ceiling
        const consumePoints = getConsumePoints ? await getConsumePoints(ctx) : 1;
        const tenantBudget = getPointsBudget ? getPointsBudget(ctx) : null;
        const effectiveBudget = Math.min(tenantBudget !== null && tenantBudget > 0 ? tenantBudget : config.points, config.points);

        // Fast path: an in-process counter skips the DB while the key is well under budget. Counted per limiter.
        const fastKey = `${keyPrefix}:${rateLimitKey}`;
        if (fastPath && tryFastConsume(fastKey, consumePoints, effectiveBudget, windowMs) === 'allow') {
          await next();
          return;
        }

        // A row opens with the time left in the window the key counts in process, so both counts restart together.
        const duration = fastPath ? windowSecondsLeft(fastKey, windowMs) : config.duration;
        // Unflushed fast-path consumes count with this request, refused or not, or `adoptDbCount` resets the counter to an undercount
        const debt = fastPath ? takeDebt(fastKey) : 0;
        const taken = await reserveAttempt(store, rateLimitKey, { points: effectiveBudget, duration }, consumePoints, debt);
        if (fastPath) adoptDbCount(fastKey, taken.state.consumedPoints, taken.state.msBeforeNext, windowMs);
        if (!taken.granted) return refuseRateLimited(ctx, taken.state, refusalType);

        await next();
        return;
      }

      const reservation = await reserveTiers(ctx, tiers, rateLimitKey, refusalType);

      // A handler that throws past the error handler leaves the attempt counted.
      await next();

      // An error answered with a redirect (token links, OAuth callbacks) responds 302; its own status is the outcome.
      const status = ctx.var.errorStatus ?? ctx.res.status;
      const outcome: Outcome = config.ignoredStatusCodes.includes(status)
        ? 'other'
        : config.failStatusCodes.includes(status)
          ? 'fail'
          : config.successStatusCodes.includes(status)
            ? 'success'
            : 'other';
      await settleTiers(reservation, outcome);
    },
  );

  return Object.assign(handler, { keyPrefix, buckets: mode === 'limit' ? [{ store, limits: config }] : tiers });
};
