import * as Sentry from '@sentry/node';
import { eq } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { systemRolesTable } from '#/db/schema/system-roles';
import { setUserRlsContext } from '#/db/tenant-context';
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
 * Fetches memberships/system role in a short-lived RLS transaction that completes
 * before calling next(). This avoids holding a transaction open for long-lived
 * requests (SSE streams, etc.). Sets baseDb on context — downstream guards
 * (tenantGuard, crossTenantGuard) replace it with their own RLS-scoped transaction.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if authentication succeeds.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export const authGuard = xMiddleware(
  {
    functionName: 'authGuard',
    type: 'x-guard',
    name: 'auth',
    description: 'Requires valid session and sets auth context (user, memberships, baseDb)',
  },
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

      const { memberships, userSystemRole } = await setUserRlsContext({ userId: user.id }, async (tx) => {
        const [memberships, [userSystemRoleRecord]] = await Promise.all([
          tx.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)),
          tx
            .select({ role: systemRolesTable.role })
            .from(systemRolesTable)
            .where(eq(systemRolesTable.userId, user.id))
            .limit(1),
        ]);

        return {
          memberships,
          userSystemRole: userSystemRoleRecord?.role ?? null,
        };
      });

      // Store values in context for downstream use
      ctx.set('memberships', memberships);
      ctx.set('userSystemRole', userSystemRole);
      ctx.set('db', baseDb);

      await next();
    } catch (err) {
      // If session validation fails, remove cookie
      if (err instanceof AppError) deleteAuthCookie(ctx, 'session');
      throw err;
    }
  },
);
