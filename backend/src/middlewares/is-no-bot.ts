import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { isbot } from 'isbot';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/** Rejects requests whose User-Agent identifies a bot with a 400. */
export const isNoBot: MiddlewareHandler<Env> = createMiddleware<Env>(async (ctx, next) => {
  if (isbot(ctx.req.header('user-agent'))) throw new AppError(400, 'maybe_bot', 'warn');
  await next();
});
