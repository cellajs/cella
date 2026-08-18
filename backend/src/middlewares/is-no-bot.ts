import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { isbot } from 'isbot';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/** Rejects requests whose User-Agent identifies a bot with a 400. */
export const isNoBot: MiddlewareHandler<Env> = createMiddleware<Env>(async (ctx, next) => {
  const userAgent = ctx.req.header('user-agent');

  // Prevent crawlers from causing spam
  if (!isbot(userAgent)) await next();
  else throw new AppError(400, 'maybe_bot', 'warn');
});
