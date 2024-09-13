import type { MiddlewareHandler } from 'hono';
import { auth as luciaAuth } from '#/db/lucia';
import { errorResponse } from '#/lib/errors';
import { removeSessionCookie } from '#/modules/auth/helpers/cookies';

const isAuthenticated: MiddlewareHandler = async (ctx, next) => {
  const cookieHeader = ctx.req.raw.headers.get('Cookie');
  // Read the session ID from the session cookie
  const sessionId = luciaAuth.readSessionCookie(cookieHeader ?? '');

  // If no session ID is found, remove the session cookie
  if (!sessionId) {
    removeSessionCookie(ctx);
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  const { session, user } = await luciaAuth.validateSession(sessionId);

  // If session validation fails, remove cookie
  if (!session) {
    removeSessionCookie(ctx);
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  // If the session is newly created, update cookie
  if (session.fresh) {
    const sessionCookie = luciaAuth.createSessionCookie(session.id);
    ctx.header('Set-Cookie', sessionCookie.serialize());
  }

  ctx.set('user', user);

  await next();
};

export default isAuthenticated;
