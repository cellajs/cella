import { eq } from 'drizzle-orm';
import type { MiddlewareHandler } from 'hono';
import type { User } from 'lucia';
import { db } from '../../db/db';
import { auth as luciaAuth } from '../../db/lucia';
import { usersTable } from '../../db/schema/users';
import { errorResponse } from '../../lib/errors';
import { removeSessionCookie } from '../../modules/auth/helpers/cookies';

const auth =
  (accessibleFor?: User['role'][]): MiddlewareHandler =>
  async (ctx, next) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = luciaAuth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    const { session, user } = await luciaAuth.validateSession(sessionId);

    if (!session) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn');
    }

    if (accessibleFor && !accessibleFor.includes(user.role)) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', true, { user: user.id });
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
    await next();
  };

export default auth;
