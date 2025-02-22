import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { usersTable } from '#/db/schema/users';
import { errorResponse } from '#/lib/errors';
import { deleteAuthCookie } from '#/modules/auth/helpers/cookie';
import { getParsedSessionCookie, validateSession } from '#/modules/auth/helpers/session';
import { membershipSelect } from '#/modules/memberships/helpers/select';
import { TimeSpan } from '#/utils/time-span';

/**
 * Middleware to ensure that the user is authenticated by checking the session cookie.
 * It also sets `user` and `memberships` in the context for further use.
 * If no valid session is found, it responds with a 401 error.
 *
 * @param ctx - Request/response context.
 * @param next - The next middleware or route handler to call if authentication succeeds.
 * @returns Error response or undefined if the user is allowed to proceed.
 */
export async function isAuthenticated(ctx: Context, next: Next): Promise<Response | undefined> {
  // Get session id from cookie
  const sessionData = await getParsedSessionCookie(ctx);

  // If no session id is found (or its corrupted/deprecated), remove session cookie
  if (!sessionData) {
    deleteAuthCookie(ctx, 'session');
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  // Validate session
  const { session, user } = await validateSession(sessionData.sessionToken);

  // If session validation fails or user not found, remove cookie
  if (!session || !user) {
    deleteAuthCookie(ctx, 'session');
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  // Update user last seen date
  if (ctx.req.method === 'GET') {
    const newLastSeenAt = new Date();
    const shouldUpdate = !user.lastSeenAt || new Date(user.lastSeenAt).getTime() < newLastSeenAt.getTime() - new TimeSpan(5, 'm').milliseconds();
    if (shouldUpdate) await db.update(usersTable).set({ lastSeenAt: newLastSeenAt.toISOString() }).where(eq(usersTable.id, user.id)).returning();
  }

  ctx.set('user', user);

  // Fetch user's memberships from the database
  const memberships = await db.select(membershipSelect).from(membershipsTable).where(eq(membershipsTable.userId, user.id));
  ctx.set('memberships', memberships);

  await next();
}
