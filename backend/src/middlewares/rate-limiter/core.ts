import { RateLimiterRes } from 'rate-limiter-flexible';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { extractIdentifiers, getRateLimiterInstance, rateLimitError } from '#/middlewares/rate-limiter/helpers';
import type {
  RateLimiterHandler,
  RateLimiterOpts,
  RateLimitIdentifier,
  RateLimitMode,
} from '#/middlewares/rate-limiter/types';
import { logEvent } from '#/utils/logger';

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
 * Each mode ALSO runs a slow brute force instance (duration 24h) in parallel to the rate limiter instance itself.
 * This is to prevent attackers from slowly trying to access data in a larger timeframe.
 *
 * @param mode - Rate limit mode that dictates how rate limiting is applied.
 * @param key - The key to identify the user or entity being rate-limited (e.g., user ID, email).
 * @param identifiers - `("ip" | "email")[]` A list of identifiers to consider when generating rate limit key.
 * @param opts - Optional configuration: limits, name, and description.
 * @returns Middleware handler for rate limiting.
 * @link https://github.com/animir/node-rate-limiter-flexible#readme
 */
export const rateLimiter = (
  mode: RateLimitMode,
  key: string,
  identifiers: RateLimitIdentifier[],
  opts?: RateLimiterOpts,
): RateLimiterHandler => {
  const { limits, functionName, name, description, onBlock, getConsumePoints, getPointsBudget } = opts ?? {};
  const config = { ...defaultOptions, ...limits };
  const keyPrefix = `${key}_${mode}`;
  const limiter = getRateLimiterInstance({ ...config, keyPrefix });
  const slowLimiter = getRateLimiterInstance({ ...slowOptions, keyPrefix: `${keyPrefix}:slow` });

  const handler = xMiddleware(
    { functionName: functionName ?? `${key}Limiter`, type: 'x-rate-limiter', name: name ?? key, description },
    async (ctx, next) => {
      // Extract identifiers from multiple sources
      const extractedIdentifiers = await extractIdentifiers(ctx, identifiers);

      // Stop if required identifiers are not available
      if (identifiers.includes('ip') && !extractedIdentifiers.ip) {
        throw new AppError(400, 'invalid_request', 'warn');
      }

      // Generate rate limit key with fallback logic
      let rateLimitKey = '';

      for (const identifier of identifiers) {
        const value = extractedIdentifiers[identifier];
        if (!value) continue;

        switch (identifier) {
          case 'ip': {
            rateLimitKey += `ip:${value}`;
            break;
          }
          case 'email': {
            rateLimitKey += `email:${value}`;
            break;
          }
          case 'userId': {
            rateLimitKey += `userId:${value}`;
            break;
          }
          case 'tenantId': {
            rateLimitKey += `tenantId:${value}`;
            break;
          }
        }
      }

      const limitState = await limiter.get(rateLimitKey);
      const slowLimitState = await slowLimiter.get(rateLimitKey);

      // If already rate limited, return 429
      if (limitState !== null && limitState.consumedPoints > limiter.points) {
        try {
          onBlock?.(rateLimitKey);
        } catch (err) {
          logEvent('warn', 'Rate limit onBlock callback failed', { rateLimitKey, err: String(err) });
        }
        return rateLimitError(ctx, limitState, rateLimitKey);
      }

      // If slow brute forcing, return 429
      if (slowLimitState !== null && slowLimitState.consumedPoints > slowLimiter.points) {
        try {
          onBlock?.(rateLimitKey);
        } catch (err) {
          logEvent('warn', 'Rate limit onBlock callback failed', { rateLimitKey, err: String(err) });
        }
        return rateLimitError(ctx, slowLimitState, rateLimitKey);
      }

      // If the rate limit mode is 'limit', consume points without blocking unless the limit is reached
      if (mode === 'limit') {
        // Resolve how many points this request costs (default: 1)
        const consumePoints = getConsumePoints ? await getConsumePoints(ctx) : 1;

        // Dynamically adjust the budget per-tenant if a getPointsBudget callback is provided
        if (getPointsBudget) {
          const budget = getPointsBudget(ctx);
          // Override the limiter's points cap for this key so existing consumed points are compared against the tenant budget
          limiter.points = budget;
        }

        try {
          await limiter.consume(rateLimitKey, consumePoints);
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) return rateLimitError(ctx, rlRejected, rateLimitKey);
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
            logEvent('warn', 'Rate limit consume failed', { rateLimitKey, err: String(err) });
          }
          // If the mode is 'failseries', delete the rate limit on successful request
        } else if (mode === 'failseries') {
          await limiter.delete(rateLimitKey);
        }
      } else if (isFail && !isIgnored && ['fail', 'failseries'].includes(mode)) {
        const slowRateLimitKey = extractedIdentifiers.ip || rateLimitKey;

        // To prevent slow brute force attacks, consume points on every failed request during 24 hours window duration
        try {
          await slowLimiter.consume(slowRateLimitKey);
        } catch (rlRejected) {
          if (rlRejected instanceof RateLimiterRes) return rateLimitError(ctx, rlRejected, slowRateLimitKey);
          throw rlRejected;
        }

        // Consume points for the specific rate limit
        try {
          await limiter.consume(rateLimitKey);
        } catch (err) {
          logEvent('warn', 'Rate limit consume failed', { rateLimitKey, err: String(err) });
        }
      }
    },
  ) as unknown as RateLimiterHandler;

  handler.keyPrefix = keyPrefix;
  handler.points = config.points;

  return handler;
};
