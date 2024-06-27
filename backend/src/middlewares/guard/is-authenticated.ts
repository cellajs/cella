import type { MiddlewareHandler } from 'hono';
import { auth as luciaAuth } from '../../db/lucia';
import { errorResponse } from '../../lib/errors';
import { i18n } from '../../lib/i18n';
import { removeSessionCookie } from '../../modules/auth/helpers/cookies';

const isAuthenticated: MiddlewareHandler = async (ctx, next) => {
  const cookieHeader = ctx.req.raw.headers.get('Cookie');
  const sessionId = luciaAuth.readSessionCookie(cookieHeader ?? '');

  if (!sessionId) {
    removeSessionCookie(ctx);
    // t('common:error.invalid_session.text')
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  const { session, user } = await luciaAuth.validateSession(sessionId);

  if (!session) {
    removeSessionCookie(ctx);
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  if (session.fresh) {
    const sessionCookie = luciaAuth.createSessionCookie(session.id);
    ctx.header('Set-Cookie', sessionCookie.serialize());
  }

  ctx.set('user', user);

  // TODO: Does this affect perf?
  await i18n.changeLanguage(user.language);
  await next();
};

export default isAuthenticated;
