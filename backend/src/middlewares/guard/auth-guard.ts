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
 * Middleware to ensure that the user is authenticated by checking the session cookie.
 * It also sets `user` and `memberships` in the context for further use.
 * If no valid session is found, it responds with a 401 error.
 *
 * Uses two in-memory TTL caches:
 * - Session cache (1 min TTL, keyed by sessionId): user + isSystemAdmin
 * - Membership cache (5 min TTL, keyed by userId): memberships array
 *   (actively invalidated on membership changes, long TTL is a safety net)
 *
 * Fetches memberships/system role in a short-lived RLS transaction that completes
 * before calling next(). This avoids holding a transaction open for long-lived
 * requests (SSE streams, etc.). Sets baseDb on context — downstream guards
 * (tenantGuard, crossTenantGuard) also set baseDb; product entity handlers
 * create their own RLS read transactions via tenantRead().
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

      // Check session cache by session row ID
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

        // Update last seen (in-memory throttle — no DB hit in practice)
        if (ctx.req.method === 'GET') {
          updateLastSeenAt(cachedSession.user.id);
        }

        return next();
      }

      // Cache miss — full validation flow
      const { session, user } = await validateSession(sessionToken);

      // Update user last seen date (throttled to 5 min intervals)
      if (ctx.req.method === 'GET') {
        updateLastSeenAt(user.id);
      }

      // Set user in context
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

      // Store values in context for downstream use
      ctx.set('memberships', memberships);
      ctx.set('isSystemAdmin', isSystemAdmin);
      ctx.set('db', baseDb);

      // Populate caches for subsequent requests
      setSessionCache(session.id, user.id, { user, isSystemAdmin });
      setMembershipCache(user.id, memberships);

      await next();
    } catch (err) {
      // If session validation fails, remove cookie
      if (err instanceof AppError) deleteAuthCookie(ctx, 'session');
      throw err;
    }
  },
);
