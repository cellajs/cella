import { eq } from 'drizzle-orm';
import { MiddlewareHandler } from 'hono';
import { User } from 'lucia';
import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { usersTable } from '../../db/schema/users';
import { removeSessionCookie } from '../../lib/cookies';
import { errorResponse } from '../../lib/error-response';

const authGuard =
  (accessibleFor?: User['role'][]): MiddlewareHandler =>
  async (ctx, next) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn')
    }

    const { session, user } = await auth.validateSession(sessionId);

    if (!session) {
      removeSessionCookie(ctx);
      return errorResponse(ctx, 401, 'unauthorized', 'warn')
    }

    if (accessibleFor && !accessibleFor.includes(user.role)) {
      return errorResponse(ctx, 403, 'forbidden', 'warn', true, { user: user.id })
    }

    if (session?.fresh) {
      const sessionCookie = auth.createSessionCookie(session.id);
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

export default authGuard;

