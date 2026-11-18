import type { MiddlewareHandler } from 'hono';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import type { AuthStrategy } from '#/modules/auth/core';

/**
 * The sign-in methods of an account without a proven address: an anonymous one, and one an LTI launch made, which
 * signs in by launch alone. Neither may bind, mail or create anything beyond its memberships.
 */
const unprovenStrategies = new Set<AuthStrategy | null | undefined>(['anonymous', 'lti']);

/**
 * Refuses a session of an account without a proven address (`unprovenStrategies`). `createXRoute` runs it after the
 * guards of every route that binds the session to no tenant and does not admit one (`xAnonymous`). A new user-level
 * route keeps such sessions out until it says otherwise.
 */
export const anonymousGate: MiddlewareHandler<Env> = async (ctx, next) => {
  const { actor } = ctx.var;
  if (actor.kind === 'user' && unprovenStrategies.has(actor.authStrategy)) throw new AppError(403, 'anonymous_session_restricted', 'warn');
  await next();
};
