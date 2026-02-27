/**
 * HTTP Cache-Control middleware presets.
 *
 * Sets standard Cache-Control headers to let browsers and CDNs cache
 * responses without server-side state. Applied via `xCache` on routes,
 * following the same pattern as entity-cache presets and rate-limiter limiters.
 *
 * Guidelines:
 * - `private` → only browser may cache (auth-required data)
 * - `public`  → CDN/proxy may also cache (anonymous/public data)
 * - `stale-while-revalidate` → serve stale while fetching fresh in background
 * - `immutable` → content at this URL never changes (hashed assets)
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control
 */
import type { MiddlewareHandler } from 'hono';
import { xMiddleware } from '#/docs/x-middleware';
import type { Env } from '#/lib/context';

interface HttpCacheOptions {
  /** Cache visibility: 'private' (browser only) or 'public' (CDN + browser) */
  scope?: 'private' | 'public';
  /** max-age in seconds (default: 3600 = 1h) */
  maxAge?: number;
  /** stale-while-revalidate window in seconds (default: 600 = 10min) */
  staleWhileRevalidate?: number;
  /** Mark as immutable (use for content-addressed URLs) */
  immutable?: boolean;
}

/**
 * HTTP cache middleware that sets Cache-Control headers.
 * Attach to GET routes via `xCache: httpCache({ ... })`.
 *
 * @example
 * // Private, 1h cache for auth-required presigned URLs
 * xCache: httpCache({ scope: 'private', maxAge: 3600 })
 *
 * @example
 * // Public, 5min cache for public entity data
 * xCache: httpCache({ scope: 'public', maxAge: 300 })
 */
export const httpCache = (options: HttpCacheOptions = {}): MiddlewareHandler<Env> => {
  const { scope = 'private', maxAge = 3600, staleWhileRevalidate = 600, immutable = false } = options;

  // Build directive string once at startup
  const directives = [
    scope,
    `max-age=${maxAge}`,
    ...(staleWhileRevalidate > 0 ? [`stale-while-revalidate=${staleWhileRevalidate}`] : []),
    ...(immutable ? ['immutable'] : []),
  ].join(', ');

  const description = `HTTP ${scope} cache: max-age=${maxAge}s`;

  return xMiddleware(
    {
      functionName: 'httpCache',
      type: 'x-cache',
      name: 'http',
      description,
    },
    async (ctx, next) => {
      await next();

      // Only cache successful GET responses
      if (ctx.req.method === 'GET' && ctx.res.status >= 200 && ctx.res.status < 300) {
        ctx.header('Cache-Control', directives);
      }
    },
  );
};
