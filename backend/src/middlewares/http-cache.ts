import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';

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
 * Builds `Cache-Control` middleware for a route's `xCache` option.
 * Private responses remain browser-only; public responses permit shared caches.
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
