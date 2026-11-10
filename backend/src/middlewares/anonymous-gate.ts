import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/**
 * Refuses an anonymous session. `createXRoute` runs it after the guards of every route that binds the session to no
 * tenant and does not admit one (`xAnonymous`), so a new user-level route keeps such sessions out until it says otherwise.
 */
export const anonymousGate: MiddlewareHandler<Env> = async (ctx, next) => {
  const { actor } = ctx.var;
  if (actor.kind === 'user' && actor.authStrategy === 'anonymous') throw new AppError(403, 'anonymous_session_restricted', 'warn');
  await next();
};
