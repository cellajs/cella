import { RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { extractIdentifiers, getRateLimiterInstance, openBucket, rateLimitError, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import { MAX_WINDOW_MS, restoreDebt, syncFromDb, takeDebt, tryFastConsume, windowSecondsLeft } from '#/middlewares/rate-limiter/points-cache';
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
 * Fail modes also count failures in a 24-hour bucket that catches slow brute-force attempts. A `limit` has no such
 * bucket, and its block replaces what is left of the window: a block shorter than the window hands out a whole budget
 * again when it ends, so no `limit` takes one. A budget holds its hour with a zero block. A pace, on a route whose
 * client retries with backoff, takes a window of minutes and a zero block.
 * @param mode - Result mode that controls point consumption.
 * @param key - Rate-limit namespace.
 * @param identifiers - Key parts or fallback chains composing the subject identifier.
 * @param opts - Limits and middleware metadata.
 */
export const rateLimiter = (mode: RateLimitMode, key: string, identifiers: RateLimitKeyPart[], opts?: RateLimiterOpts): RateLimiterHandler => {
  const { limits, functionName, name, description, getConsumePoints, getPointsBudget, countsInProcess } = opts ?? {};
  const config = { ...defaultOptions, ...limits };
  const keyPrefix = `${key}_${mode}`;
  const fastPath = mode === 'limit' && (countsInProcess || getPointsBudget !== undefined);
  /** The window the in-process counter keeps for a key: the limiter's own, up to the hour the counter keeps an idle key. */
  const windowMs = config.duration * 1000;
  if (fastPath && windowMs > MAX_WINDOW_MS) throw new Error(`${keyPrefix}: counting in process needs a window of at most an hour`);
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

        // Fast path: an in-process counter skips the DB while the key is well under budget. Counted per limiter.
        const fastKey = `${keyPrefix}:${rateLimitKey}`;
        if (fastPath && tryFastConsume(fastKey, consumePoints, effectiveBudget, windowMs) === 'allow') {
          await next();
          return;
        }

        const limitState = await store.get(rateLimitKey);
        if (limitState !== null && limitState.consumedPoints > effectiveBudget) {
          return rateLimitError(ctx, limitState);
        }
        // A row opens with the time left in the window the key counts in process, so both counts restart together.
        const windowSeconds = fastPath ? windowSecondsLeft(fastKey, windowMs) : config.duration;
        // No live row yet: create it first, or the first requests of a parallel burst each start the count at one.
        if (limitState === null) await openBucketSafely(store, rateLimitKey, windowSeconds);

        // Settle unflushed fast-path consumes with this request's cost, or `syncFromDb` resets the counter to an undercount
        const debt = fastPath ? takeDebt(fastKey) : 0;

        try {
          const consumeResult = await store.consume(rateLimitKey, consumePoints + debt, { customDuration: windowSeconds });
          if (fastPath) syncFromDb(fastKey, consumeResult.consumedPoints, consumeResult.msBeforeNext, windowMs);
          // The library only rejects at the static ceiling; the smaller per-tenant budget is enforced here
          if (consumeResult.consumedPoints > effectiveBudget) {
            return rateLimitError(ctx, consumeResult);
          }
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) {
            // A refusal proves the bucket spent, and one from the store's in-memory block reports no count of its own
            if (fastPath) syncFromDb(fastKey, Math.max(rlRejected.consumedPoints, config.points), rlRejected.msBeforeNext, windowMs);
            return rateLimitError(ctx, rlRejected);
          }
          // DB write failed: return the claimed debt so it is settled on a later request.
          restoreDebt(fastKey, debt);
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
