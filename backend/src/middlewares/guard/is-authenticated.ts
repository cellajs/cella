import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from '#/db/db';
import { membershipsTable } from '#/db/schema/memberships';
import { errorResponse } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/helpers/cookie';
import { validateSession } from '#/modules/auth/helpers/session';
import { membershipSelect } from '#/modules/memberships/helpers/select';

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
  const sessionToken = await getAuthCookie(ctx, 'session');

  // If no session id is found (or its corrupted/deprecated), remove session cookie
  if (!sessionToken) {
    deleteAuthCookie(ctx, 'session');
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  // Validate session
  const { session, user } = await validateSession(sessionToken);

  // If session validation fails, remove cookie
  if (!session) {
    deleteAuthCookie(ctx, 'session');
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  ctx.set('user', user);

  // Fetch user's memberships from the database
  const memberships = await db.select(membershipSelect).from(membershipsTable).where(eq(membershipsTable.userId, user.id));
  ctx.set('memberships', memberships);

  await next();
}
