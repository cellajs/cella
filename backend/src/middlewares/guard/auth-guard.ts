import { eq } from 'drizzle-orm';
import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { deleteAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/general/helpers/session';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { isSystemAccessAllowed } from '#/utils/system-access';
import { updateLastSeenAt } from '../update-last-seen';
import { getMembershipCache, getSessionCache, setMembershipCache, setSessionCache } from './auth-cache';

/**
 * Authenticates the session and sets user, memberships, and base db context from short TTL caches. The RLS lookup
 * transaction ends before `next()`, so handlers open their own scoped reads.
 */
export const authGuard = xMiddleware(
  {
    functionName: 'authGuard',
    type: 'x-guard',
    name: 'auth',
    description: 'Requires valid session and sets auth context (user, memberships, baseDb)',
  },
  async (ctx, next) => {
    try {
      // Parse session cookie (lightweight, no DB)
      const { sessionToken, sessionId } = await getParsedSessionCookie(ctx);

      const cachedSession = getSessionCache(sessionId);
      if (cachedSession) {
        ctx.set('user', cachedSession.user);
        ctx.set('userId', cachedSession.user.id);
        ctx.set('sessionToken', sessionToken);
        ctx.set('isSystemAdmin', cachedSession.isSystemAdmin);
        ctx.set('db', baseDb);

        // Memberships cached separately with longer TTL (keyed by userId)
        let memberships = getMembershipCache(cachedSession.user.id);
        if (!memberships) {
          memberships = await baseDb
            .select()
            .from(membershipsTable)
            .where(eq(membershipsTable.userId, cachedSession.user.id));
          setMembershipCache(cachedSession.user.id, memberships);
        }
        ctx.set('memberships', memberships);

        if (ctx.req.method === 'GET') {
          updateLastSeenAt(cachedSession.user.id);
        }

        return next();
      }

      const { session, user } = await validateSession(sessionToken);

      if (ctx.req.method === 'GET') {
        updateLastSeenAt(user.id);
      }

      ctx.set('user', user);
      ctx.set('userId', user.id);
      ctx.set('sessionToken', sessionToken);

      const systemAccessAllowed = isSystemAccessAllowed(ctx);

      const { memberships, isSystemAdmin } = await baseDb.transaction(async (tx) => {
        const [memberships, [systemRoleRecord]] = await Promise.all([
          tx.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id)),
          // Only query system roles when system access is allowed for this request
          ...(systemAccessAllowed
            ? [
                tx
                  .select({ role: systemRolesTable.role })
                  .from(systemRolesTable)
                  .where(eq(systemRolesTable.userId, user.id))
                  .limit(1),
              ]
            : [Promise.resolve([])]),
        ]);

        return {
          memberships,
          isSystemAdmin: systemAccessAllowed && systemRoleRecord?.role === 'admin',
        };
      });

      ctx.set('memberships', memberships);
      ctx.set('isSystemAdmin', isSystemAdmin);
      ctx.set('db', baseDb);

      setSessionCache(session.id, user.id, { user, isSystemAdmin });
      setMembershipCache(user.id, memberships);

      await next();
    } catch (err) {
      if (err instanceof AppError) deleteAuthCookie(ctx, 'session');
      throw err;
    }
  },
);
