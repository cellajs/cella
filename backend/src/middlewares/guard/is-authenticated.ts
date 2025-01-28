import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { errorResponse } from '#/lib/errors';
import { deleteAuthCookie, getAuthCookie } from '#/modules/auth/helpers/cookie';
import { validateSession } from '#/modules/auth/helpers/session';

export async function isAuthenticated(ctx: Context, next: Next): Promise<Response | undefined> {
  // Get session id from cookie
  const sessionToken = await getAuthCookie(ctx, 'session');

  // If no session id is found, remove session cookie
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
  // TODO: should these be scoped to the current organization if it is in a scoped endpoint?
  const memberships = await db.select(membershipSelect).from(membershipsTable).where(eq(membershipsTable.userId, user.id));
  ctx.set('memberships', memberships);

  await next();
}
