import { createMiddleware } from 'hono/factory';
import { isbot } from 'isbot';
import type { Env } from '#/lib/context';
import { errorResponse } from '../lib/errors';

/**
 * Middleware to block bot requests based on the User-Agent header.
 * If the request comes from a bot, a 403 error is returned. Otherwise, the request proceeds.
 */
export const isNoBot = createMiddleware<Env>(async (ctx, next) => {
  const userAgent = ctx.req.header('user-agent');

  // Prevent crawlers from causing spam
  if (!isbot(userAgent)) await next();
  else errorResponse(ctx, 403, 'maybe_bot', 'warn');
});
