import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import { db } from '../../db/db';
import { auth as luciaAuth } from '../../db/lucia';
import { usersTable } from '../../db/schema/users';
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

    if (session?.fresh) {
      const sessionCookie = luciaAuth.createSessionCookie(session.id);
      ctx.header('Set-Cookie', sessionCookie.serialize());
    }

    const method = ctx.req.method.toLowerCase();
    const path = ctx.req.path;

    await db
      .update(usersTable)
      .set({
        lastSeenAt: new Date(),
        lastVisitAt: method === 'get' && path === '/me' ? new Date() : undefined,
      })
      .where(eq(usersTable.id, user.id));

    ctx.set('user', user);

    // TODO: Perf impact test
    await i18n.changeLanguage(user.language || 'en');

    await next();
  };

export default isAuthenticated;
