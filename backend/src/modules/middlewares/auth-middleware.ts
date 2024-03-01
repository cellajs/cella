import { eq } from 'drizzle-orm';
import { MiddlewareHandler } from 'hono';
import { User } from 'lucia';
import { db } from '../../db/db';
import { auth } from '../../db/lucia';
import { usersTable } from '../../db/schema';
import { customLogger } from '../../lib/custom-logger';
import { forbiddenError, unauthorizedError } from '../../lib/errors';
import { ErrorResponse } from '../../types/common';
import { removeSessionCookie } from '../../lib/cookies';

// authMiddleware() is checking if the user is authenticated and if the user has the required role
const authMiddleware =
  (accessibleFor?: User['role'][]): MiddlewareHandler =>
  async (ctx, next) => {
    const cookieHeader = ctx.req.raw.headers.get('Cookie');
    const sessionId = auth.readSessionCookie(cookieHeader ?? '');

    if (!sessionId) {
      removeSessionCookie(ctx);
      return ctx.json<ErrorResponse>(unauthorizedError(), 401);
    }

    const { session, user } = await auth.validateSession(sessionId);

    if (!session) {
      removeSessionCookie(ctx);
      return ctx.json<ErrorResponse>(unauthorizedError(), 401);
    }

    if (accessibleFor && !accessibleFor.includes(user.role)) {
      customLogger('User forbidden', { user: user.id }, 'warn');
      return ctx.json<ErrorResponse>(forbiddenError(), 403);
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

export default authMiddleware;
