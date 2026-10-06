import { RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { extractIdentifiers, getRateLimiterInstance, openBucket, rateLimitError, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { restoreDebt, syncFromDb, takeDebt, tryFastConsume } from '#/middlewares/rate-limiter/points-cache';
import { reserveTiers, settleTiers, slowTier } from '#/middlewares/rate-limiter/tiers';
import type { Outcome, RateLimiterHandler, RateLimiterOpts, RateLimitKeyPart, RateLimitMode, Tier } from '#/middlewares/rate-limiter/types';
import { log } from '#/utils/logger';

const defaultOptions = {
  points: 10,
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 30,
  successStatusCodes: [200, 201],
  failStatusCodes: [401, 403, 404],
  ignoredStatusCodes: [429],
};

/** Opens a bucket before its first consume; the store falls back to its in-memory insurance while the database is unreachable. */
async function openBucketSafely(store: ReturnType<typeof getRateLimiterInstance>, rateLimitKey: string, durationSeconds: number) {
  try {
    await openBucket(store, rateLimitKey, durationSeconds);
  } catch (err) {
    log.warn('Rate limit bucket could not be opened', { rateLimitKey, err });
  }
}

/**
 * Builds a route rate limiter. `limit` consumes every result, `success` and `fail` only matching ones, `failseries`
 * resets after a success. `success` and the fail modes count an attempt before the handler runs and give it back unless
 * it had the counted outcome, so a parallel burst reaches the handler at most `points` times. A spent `success` budget
 * holds until its window ends. A `limit` blocks for `blockDuration` from the request past its budget (for the rest of
 * the window when that is zero), a fail mode from the failure that spent it.
 * Fail modes also count failures in a 24-hour bucket that catches slow brute-force attempts.
 * @param mode - Result mode that controls point consumption.
 * @param key - Rate-limit namespace.
 * @param identifiers - Key parts or fallback chains composing the subject identifier.
 * @param opts - Limits and middleware metadata.
 */
export const rateLimiter = (mode: RateLimitMode, key: string, identifiers: RateLimitKeyPart[], opts?: RateLimiterOpts): RateLimiterHandler => {
  const { limits, functionName, name, description, getConsumePoints, getPointsBudget } = opts ?? {};
  const config = { ...defaultOptions, ...limits };
  const keyPrefix = `${key}_${mode}`;
  const isFailMode = mode === 'fail' || mode === 'failseries';
  const store = getRateLimiterInstance({ ...config, keyPrefix, inMemoryBlock: mode === 'limit' });
  /** The buckets a reserved attempt counts in: the route's own and, behind a failure budget, the 24-hour one. */
  const tiers: Tier[] =
    mode === 'limit' ? [] : [{ store, limits: config, counts: isFailMode ? 'fail' : 'success', resetsOnSuccess: mode === 'failseries' }];
  if (isFailMode) tiers.push(slowTier(keyPrefix));

  const handler = xMiddleware(
    { functionName: functionName ?? `${key}Limiter`, type: 'x-rate-limiter', name: name ?? key, description },
    async (ctx, next) => {
      const extractedIdentifiers = await extractIdentifiers(ctx, identifiers.flat());

      // Each key part contributes one segment; fallback chains use their first available identity
      let rateLimitKey = '';

      for (const part of identifiers) {
        const chain = Array.isArray(part) ? part : [part];
        const identifier = chain.find((id) => extractedIdentifiers[id]);

        if (!identifier) {
          // Chains and bare ip/email must resolve; bare userId/tenantId are skipped so pointsLimiter can fall back
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

      if (mode === 'limit') {
        // Clamp tenant budgets without mutating the shared prefix limiter; a zero tenant budget uses the global ceiling
        const consumePoints = getConsumePoints ? await getConsumePoints(ctx) : 1;
        const tenantBudget = getPointsBudget ? getPointsBudget(ctx) : null;
        const effectiveBudget = Math.min(tenantBudget !== null && tenantBudget > 0 ? tenantBudget : config.points, config.points);

        // Fast path: an in-process counter skips the DB while the key is well under budget.
        if (getPointsBudget && tryFastConsume(rateLimitKey, consumePoints, effectiveBudget) === 'allow') {
          await next();
          return;
        }

        const limitState = await store.get(rateLimitKey);
        if (limitState !== null && limitState.consumedPoints > effectiveBudget) {
          return rateLimitError(ctx, limitState);
        }
        // No live row yet: create it first, or the first requests of a parallel burst each start the count at one.
        if (limitState === null) await openBucketSafely(store, rateLimitKey, config.duration);

        // Settle unflushed fast-path consumes with this request's cost, or `syncFromDb` resets the counter to an undercount
        const debt = getPointsBudget ? takeDebt(rateLimitKey) : 0;

        try {
          const consumeResult = await store.consume(rateLimitKey, consumePoints + debt);
          if (getPointsBudget) syncFromDb(rateLimitKey, consumeResult.consumedPoints);
          // The library only rejects at the static ceiling; the smaller per-tenant budget is enforced here
          if (consumeResult.consumedPoints > effectiveBudget) {
            return rateLimitError(ctx, consumeResult);
          }
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) {
            if (getPointsBudget) syncFromDb(rateLimitKey, rlRejected.consumedPoints);
            return rateLimitError(ctx, rlRejected);
          }
          // DB write failed: return the claimed debt so it is settled on a later request.
          restoreDebt(rateLimitKey, debt);
          throw rlRejected;
        }

        await next();
        return;
      }

      const reservation = await reserveTiers(ctx, tiers, rateLimitKey);

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
