import { RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import {
  blockSpentBucket,
  extractIdentifiers,
  getRateLimiterInstance,
  openBucket,
  rateLimitError,
  refundAttempt,
  reserveAttempt,
} from '#/middlewares/rate-limiter/helpers';
import { restoreDebt, syncFromDb, takeDebt, tryFastConsume } from '#/middlewares/rate-limiter/points-cache';
import type {
  RateLimiterHandler,
  RateLimiterOpts,
  RateLimitKeyPart,
  RateLimitMode,
} from '#/middlewares/rate-limiter/types';
import { toRateLimitIp } from '#/utils/ip-subnet';
import { log } from '#/utils/logger';

export const defaultOptions = {
  tableName: 'rate_limits',
  points: 10,
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 30,
  successStatusCodes: [200, 201],
  failStatusCodes: [401, 403, 404],
  ignoredStatusCodes: [429],
};

// Slow brute force options
export const slowOptions = {
  tableName: defaultOptions.tableName,
  points: 100,
  duration: 60 * 60 * 24, // within 24 hours
  blockDuration: 60 * 60 * 3,
};

type FailureStore = ReturnType<typeof getRateLimiterInstance>;
type BucketLimits = { points: number; duration: number; blockDuration: number };

/** A zero block duration would block forever in the store; fall back to the counting window. */
const blockSecondsOf = ({ duration, blockDuration }: BucketLimits) => (blockDuration > 0 ? blockDuration : duration);

/**
 * Records one failure against a fail-mode bucket after the handler ran (the 24-hour bucket). Blocking the key in the
 * database when the budget is spent is what makes the next request's pre-check (`consumedPoints > points`) refuse it,
 * for `blockDuration`, in every process.
 */
async function recordFailure(store: FailureStore, rateLimitKey: string, limits: BucketLimits) {
  try {
    const result = await store.consume(rateLimitKey);
    if (result.consumedPoints >= limits.points) await store.block(rateLimitKey, blockSecondsOf(limits));
  } catch (err) {
    if (!(err instanceof RateLimiterRes)) {
      log.warn('Rate limit consume failed', { rateLimitKey, err });
      return;
    }
    await store.block(rateLimitKey, blockSecondsOf(limits));
  }
}

/** Opens a bucket before its first consume; the store falls back to its in-memory insurance while the database is unreachable. */
async function openBucketSafely(store: FailureStore, rateLimitKey: string, durationSeconds: number) {
  try {
    await openBucket(store, rateLimitKey, durationSeconds);
  } catch (err) {
    log.warn('Rate limit bucket could not be opened', { rateLimitKey, err });
  }
}

type Outcome = 'fail' | 'success' | 'other';

/**
 * Settles a reserved attempt once the handler answered. The outcome the bucket counts keeps it, and a counted failure
 * answered while the whole budget is taken blocks the key; a success of a failure series resets the series; any other
 * outcome gives it back, so nothing but counted outcomes ever blocks a key.
 */
async function settleAttempt(
  store: FailureStore,
  rateLimitKey: string,
  limits: BucketLimits,
  { outcome, counted, resetsSeries }: { outcome: Outcome; counted: Exclude<Outcome, 'other'>; resetsSeries: boolean },
) {
  try {
    if (outcome === counted) {
      if (counted === 'fail') await blockSpentBucket(store, rateLimitKey, limits.points, blockSecondsOf(limits));
    } else if (outcome === 'success' && resetsSeries) {
      await store.delete(rateLimitKey);
    } else {
      await refundAttempt(store, rateLimitKey);
    }
  } catch (err) {
    log.warn('Rate limit attempt could not be settled', { rateLimitKey, err });
  }
}

/**
 * Builds a route rate limiter. `limit` consumes every result, `success` and `fail` only matching ones, `failseries`
 * resets after a success. `success` and the fail modes count an attempt before the handler runs and give it back unless
 * it had the counted outcome, so a parallel burst reaches the handler at most `points` times. A spent `success` budget
 * holds until its window ends, as a limit does; a fail mode blocks for `blockDuration` from the failure that spent it.
 * Fail modes also count failures in a 24-hour bucket that catches slow brute-force attempts.
 * @param mode - Result mode that controls point consumption.
 * @param key - Rate-limit namespace.
 * @param identifiers - Key parts or fallback chains composing the subject identifier.
 * @param opts - Limits and middleware metadata.
 */
export const rateLimiter = (
  mode: RateLimitMode,
  key: string,
  identifiers: RateLimitKeyPart[],
  opts?: RateLimiterOpts,
): RateLimiterHandler => {
  const { limits, functionName, name, description, onBlock, getConsumePoints, getPointsBudget } = opts ?? {};
  const config = { ...defaultOptions, ...limits };
  const keyPrefix = `${key}_${mode}`;
  const isFailMode = mode === 'fail' || mode === 'failseries';
  const limiter = getRateLimiterInstance({ ...config, keyPrefix, inMemoryBlock: mode === 'limit' });
  const slowLimiter = isFailMode
    ? getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow`, inMemoryBlock: false })
    : null;

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

        const value = extractedIdentifiers[identifier] as string;
        // Normalize IPs so IPv6 clients cannot rotate within their /64 to evade auth rate limits
        rateLimitKey += `${identifier}:${identifier === 'ip' ? toRateLimitIp(value) : value}`;
      }

      // An empty key would share one bucket across all traffic (a userId-keyed limiter on a public route): misconfiguration
      if (!rateLimitKey) throw new AppError(400, 'invalid_request', 'warn');

      // Clamp tenant budgets without mutating the shared prefix limiter; a zero tenant budget uses the global ceiling
      const consumePoints = mode === 'limit' && getConsumePoints ? await getConsumePoints(ctx) : 1;
      const tenantBudget = mode === 'limit' && getPointsBudget ? getPointsBudget(ctx) : null;
      const effectiveBudget =
        tenantBudget === null
          ? config.points
          : Math.min(tenantBudget > 0 ? tenantBudget : config.points, config.points);

      // Fast path: an in-process counter skips the DB while the key is well under budget.
      // Auth limiters (failseries, success, fail) always take the DB path for accuracy.
      if (mode === 'limit' && getPointsBudget) {
        const decision = tryFastConsume(rateLimitKey, consumePoints, effectiveBudget);
        if (decision === 'allow') {
          await next();
          return;
        }
        // 'check-db' falls through to the standard DB path below
      }

      const refuse = (state: RateLimiterRes) => {
        try {
          onBlock?.(rateLimitKey, ctx);
        } catch (err) {
          log.warn('Rate limit onBlock callback failed', { rateLimitKey, err });
        }
        return rateLimitError(ctx, state, rateLimitKey);
      };

      if (mode === 'limit') {
        const limitState = await limiter.get(rateLimitKey);
        if (limitState !== null && limitState.consumedPoints > effectiveBudget) return refuse(limitState);
        // No live row yet: create it first, or the first requests of a parallel burst each start the count at one.
        if (limitState === null) await openBucketSafely(limiter, rateLimitKey, config.duration);

        // Settle unflushed fast-path consumes with this request's cost, or `syncFromDb` resets the counter to an undercount
        const debt = getPointsBudget ? takeDebt(rateLimitKey) : 0;

        try {
          const consumeResult = await limiter.consume(rateLimitKey, consumePoints + debt);
          if (getPointsBudget) syncFromDb(rateLimitKey, consumeResult.consumedPoints);
          // The library only rejects at the static ceiling; the smaller per-tenant budget is enforced here
          if (consumeResult.consumedPoints > effectiveBudget) {
            return rateLimitError(ctx, consumeResult, rateLimitKey);
          }
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) {
            if (getPointsBudget) syncFromDb(rateLimitKey, rlRejected.consumedPoints);
            return rateLimitError(ctx, rlRejected, rateLimitKey);
          }
          // DB write failed: return the claimed debt so it is settled on a later request.
          restoreDebt(rateLimitKey, debt);
          throw rlRejected;
        }

        await next();
        return;
      }

      if (slowLimiter) {
        const slowLimitState = await slowLimiter.get(rateLimitKey);
        if (slowLimitState !== null && slowLimitState.consumedPoints > slowLimiter.points) {
          return refuse(slowLimitState);
        }
      }

      const reservation = await reserveAttempt(limiter, rateLimitKey, config);
      if (!reservation.granted) return refuse(reservation.state);

      // A handler that throws past the error handler leaves the attempt counted.
      await next();

      // An error answered with a redirect (token links, OAuth callbacks) responds 302; its own status is the outcome.
      const status = ctx.var.errorStatus ?? ctx.res.status;
      const outcome: Outcome = config.ignoredStatusCodes?.includes(status)
        ? 'other'
        : config.failStatusCodes?.includes(status)
          ? 'fail'
          : config.successStatusCodes?.includes(status)
            ? 'success'
            : 'other';

      // Must use the same normalized key as the slow-bucket lookup, or the 24-hour bucket never blocks
      if (slowLimiter && outcome === 'fail') await recordFailure(slowLimiter, rateLimitKey, slowOptions);
      await settleAttempt(reservation.store, rateLimitKey, config, {
        outcome,
        counted: isFailMode ? 'fail' : 'success',
        resetsSeries: mode === 'failseries',
      });
    },
  );

  return Object.assign(handler, { keyPrefix, points: config.points });
};
