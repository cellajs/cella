import * as Sentry from '@sentry/node';
import { eq } from 'drizzle-orm';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { systemRolesTable } from '#/db/schema/system-roles';
import { xMiddleware } from '#/docs/x-middleware';
import { AppError } from '#/lib/error';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { updateLastSeenAt } from '../update-last-seen';

/**
 * Middleware to ensure that the user is authenticated by checking the session cookie.
 * It also sets `user` and `memberships` in the context for further use.
 * If no valid session is found, it responds with a 401 error.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if authentication succeeds.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const isAuthenticated = xMiddleware(
  'isAuthenticated',
  'x-guard',
  async (ctx, next) => {
    // Validate session
    try {
      // Get session id from cookie
      const { sessionToken } = await getParsedSessionCookie(ctx);
      const { user } = await validateSession(sessionToken);

      // Update user last seen date (throttled to 5 min intervals, stored in user_activity table)
      if (ctx.req.method === 'GET') {
        await updateLastSeenAt(user.id, user.lastSeenAt);
      }

      // Set user in context and add to monitoring
      ctx.set('user', user);
      ctx.set('sessionToken', sessionToken);
      Sentry.setUser({
        id: user.id,
        email: user.email,
        username: user.slug,
      });

      // Fetch the user's memberships and system role in parallel
      const [memberships, [userSystemRoleRecord]] = await Promise.all([
        db.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)),
        db
          .select({ role: systemRolesTable.role })
          .from(systemRolesTable)
          .where(eq(systemRolesTable.userId, user.id))
          .limit(1),
      ]);

      // Store values in context for downstream use
      ctx.set('memberships', memberships);
      ctx.set('userSystemRole', userSystemRoleRecord?.role ?? null); // null if no system role is assigned
    } catch (err) {
      // If session validation fails, remove cookie
      if (err instanceof AppError) deleteAuthCookie(ctx, 'session');
      throw err;
    }

    await next();
  },
  'Requires valid session',
);
