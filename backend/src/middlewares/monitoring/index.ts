import * as Sentry from '@sentry/node';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { Env } from '#/lib/context';

/**
 * Middleware to monitor and log errors and performance metrics.
 * This middleware integrates with Sentry for error tracking and performance monitoring.
 * Using setUser and setTag, it attaches user and tag information to the Sentry context in middleware
 * when they have become available to share.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call after this middleware completes its work.
 */
export const monitoringMiddleware: MiddlewareHandler<Env> = createMiddleware<Env>(async (ctx, next) => {
  // Attach SDK to context
  ctx.set('sentry', Sentry);

  // Set request context
  Sentry.setContext('request', {
    method: ctx.req.method,
    url: ctx.req.url,
    headers: Object.fromEntries(ctx.req.raw.headers.entries()),
    query_string: ctx.req.url.split('?')[1] || '',
  });

  // Add tracing span
  await Sentry.startSpan({ name: `${ctx.req.method} ${ctx.req.path}` }, async (span) => {
    ctx.set('sentrySpan', span);

    try {
      await next();
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    } finally {
      span?.end();
    }
  });

  // In case ctx.error is set but not thrown
  if (ctx.error) {
    Sentry.captureException(ctx.error);
  }
});
