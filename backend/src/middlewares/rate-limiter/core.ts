import { RateLimiterRes } from 'rate-limiter-flexible';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { extractIdentifiers, getRateLimiterInstance, rateLimitError } from '#/middlewares/rate-limiter/helpers';
import { restoreDebt, syncFromDb, takeDebt, tryFastConsume } from '#/middlewares/rate-limiter/points-cache';
import type {
  RateLimiterHandler,
  RateLimiterOpts,
  RateLimitKeyPart,
  RateLimitMode,
} from '#/middlewares/rate-limiter/types';
import { toRateLimitIp } from '#/utils/ip-subnet';
import { log } from '#/utils/logger';

// Default options
export const defaultOptions = {
  tableName: 'rate_limits', // Name of table in database
  points: 10, // 10 requests
  duration: 60 * 60, // within 1 hour
  blockDuration: 60 * 30, // Block for 30 minutes
  successStatusCodes: [200, 201],
  failStatusCodes: [401, 403, 404],
  ignoredStatusCodes: [429],
};

// Slow brute force options
export const slowOptions = {
  tableName: defaultOptions.tableName, // Name of table in database
  points: 100, // 100 requests
  duration: 60 * 60 * 24, // within 24 hour
  blockDuration: 60 * 60 * 3, // Block for 3 hours
};

/**
 * Rate Limiter Middleware for API routes to control the rate of requests based on different modes and identifiers.
 *
 * It uses the `rate-limiter-flexible` library to limit the number of requests.
 *
 * The 'limit' mode consumes points for each failed/successful request.
 * The 'success' mode decreases the available points on successful requests only.
 * The 'fail' decreases points on failed requests only.
 * The 'failseries' decreases points on consecutive failed requests: it resets the rate limit on a successful request.
 *
 * The fail-driven modes ('fail', 'failseries') ALSO run a slow brute force instance (duration 24h)
 * in parallel to the rate limiter instance itself. This is to prevent attackers from slowly trying
 * to access data in a larger timeframe. 'limit' and 'success' never consume the slow bucket, so
 * they skip it entirely.
 *
 * @param mode - Rate limit mode that dictates how rate limiting is applied.
 * @param key - The key to identify the user or entity being rate-limited (e.g., user ID, email).
 * @param identifiers - Key parts concatenated into the rate limit key. Each part is a single
 *   identifier or a fallback chain (see {@link RateLimitKeyPart}).
 * @param opts - Optional configuration: limits, name, and description.
 * @returns Middleware handler for rate limiting.
 * @link https://github.com/animir/node-rate-limiter-flexible#readme
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
  const limiter = getRateLimiterInstance({ ...config, keyPrefix });
  const isFailMode = mode === 'fail' || mode === 'failseries';
  const slowLimiter = isFailMode ? getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` }) : null;

  const handler = xMiddleware(
    { functionName: functionName ?? `${key}Limiter`, type: 'x-rate-limiter', name: name ?? key, description },
    async (ctx, next) => {
      // Extract every identifier any key part (or chain member) can use
      const extractedIdentifiers = await extractIdentifiers(ctx, identifiers.flat());

      // Generate rate limit key. Each part contributes one segment; a chain part
      // uses its first available identifier (e.g. ['userId', 'ip'] keys signed-in
      // traffic per user so shared-IP offices are not collectively throttled, and
      // falls back to IP for anonymous requests).
      let rateLimitKey = '';

      for (const part of identifiers) {
        const chain = Array.isArray(part) ? part : [part];
        const identifier = chain.find((id) => extractedIdentifiers[id]);

        if (!identifier) {
          // Chains and bare ip/email must resolve. Bare userId/tenantId keep their
          // silent skip: pointsLimiter budgets fall back when tenant context is absent.
          if (Array.isArray(part) || part === 'ip' || part === 'email') {
            throw new AppError(400, 'invalid_request', 'warn');
          }
          continue;
        }

        const value = extractedIdentifiers[identifier] as string;
        // Normalize IPs so IPv6 clients cannot rotate addresses within their
        // allocated /64 to evade auth rate limits.
        rateLimitKey += `${identifier}:${identifier === 'ip' ? toRateLimitIp(value) : value}`;
      }

      // An empty key would silently share one bucket across all traffic (e.g. a
      // userId-keyed limiter on a public route) — treat it as a misconfiguration.
      if (!rateLimitKey) throw new AppError(400, 'invalid_request', 'warn');

      // Resolve cost and budget once for `limit` mode. The static `config.points` is a hard
      // ceiling: tenant budgets are clamped to it and never mutate the shared limiter instance
      // (assigning `limiter.points` would let one tenant's budget judge another tenant's
      // request, since instances are memoized per keyPrefix across all tenants).
      // Budget 0 means "no tenant-specific limit": the global ceiling still applies.
      const consumePoints = mode === 'limit' && getConsumePoints ? await getConsumePoints(ctx) : 1;
      const tenantBudget = mode === 'limit' && getPointsBudget ? getPointsBudget(ctx) : null;
      const effectiveBudget =
        tenantBudget === null
          ? config.points
          : Math.min(tenantBudget > 0 ? tenantBudget : config.points, config.points);

      // ── Fast path for `limit` mode (pointsLimiter) ──
      // Uses an in-process LRU counter to skip DB when the key is well under budget.
      // Auth limiters (failseries, success, fail) always take the DB path for accuracy.
      if (mode === 'limit' && getPointsBudget) {
        const decision = tryFastConsume(rateLimitKey, consumePoints, effectiveBudget);
        if (decision === 'allow') {
          await next();
          return;
        }
        // 'check-db' falls through to the standard DB path below
      }

      const limitState = await limiter.get(rateLimitKey);

      // If already rate limited, return 429
      if (limitState !== null && limitState.consumedPoints > effectiveBudget) {
        try {
          onBlock?.(rateLimitKey, ctx);
        } catch (err) {
          log.warn('Rate limit onBlock callback failed', { rateLimitKey, err });
        }
        return rateLimitError(ctx, limitState, rateLimitKey);
      }

      // If slow brute forcing, return 429
      if (slowLimiter) {
        const slowLimitState = await slowLimiter.get(rateLimitKey);
        if (slowLimitState !== null && slowLimitState.consumedPoints > slowLimiter.points) {
          try {
            onBlock?.(rateLimitKey, ctx);
          } catch (err) {
            log.warn('Rate limit onBlock callback failed', { rateLimitKey, err });
          }
          return rateLimitError(ctx, slowLimitState, rateLimitKey);
        }
      }

      // If the rate limit mode is 'limit', consume points without blocking unless the limit is reached
      if (mode === 'limit') {
        // Settle unflushed fast-path consumes together with this request's cost, so the
        // DB count is authoritative. Without this the fast path undercounts the DB and
        // `syncFromDb` resets the local counter to that undercount, disabling the budget.
        const debt = getPointsBudget ? takeDebt(rateLimitKey) : 0;

        try {
          const consumeResult = await limiter.consume(rateLimitKey, consumePoints + debt);
          // Sync the LRU cache with the authoritative DB count
          if (getPointsBudget) syncFromDb(rateLimitKey, consumeResult.consumedPoints);
          // The library only rejects at the static ceiling; the (possibly smaller)
          // per-tenant budget is enforced here.
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
      }

      // Continue with request itself
      await next();

      const isSuccess = config.successStatusCodes?.includes(ctx.res.status) ?? false;
      const isFail = config.failStatusCodes?.includes(ctx.res.status) ?? false;
      const isIgnored = config.ignoredStatusCodes?.includes(ctx.res.status) ?? false;

      if (isSuccess && !isIgnored) {
        // If the mode is 'success', consume points on successful requests
        if (mode === 'success') {
          try {
            await limiter.consume(rateLimitKey);
          } catch (err) {
            log.warn('Rate limit consume failed', { rateLimitKey, err });
          }
          // If the mode is 'failseries', delete the rate limit on successful request
        } else if (mode === 'failseries') {
          await limiter.delete(rateLimitKey);
        }
      } else if (isFail && !isIgnored && slowLimiter) {
        // Consume the SAME normalized key the slow limiter is CHECKED with above (slowLimiter.get),
        // so the 24h slow-brute-force bucket actually accumulates against the key it is read from.
        // Previously it consumed an un-prefixed `toRateLimitIp(ip)` while reading `ip:<normalized>`,
        // so the bucket never grew and could never block. Slow-path limiters are ip-only, so
        // rateLimitKey is exactly `ip:<normalized>`.
        try {
          await slowLimiter.consume(rateLimitKey);
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) return rateLimitError(ctx, rlRejected, rateLimitKey);
          throw rlRejected;
        }

        // Consume points for the specific rate limit
        try {
          await limiter.consume(rateLimitKey);
        } catch (err) {
          log.warn('Rate limit consume failed', { rateLimitKey, err });
        }
      }
    },
  );

  return Object.assign(handler, { keyPrefix, points: config.points });
};
