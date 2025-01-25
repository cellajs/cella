import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';
import { db } from '#/db/db';
import { membershipSelect, membershipsTable } from '#/db/schema/memberships';
import { errorResponse } from '#/lib/errors';
import { deleteSessionCookie, getSessionIdFromCookie, validateSession } from '#/modules/auth/helpers/session';

export async function isAuthenticated(ctx: Context, next: Next): Promise<Response | undefined> {
  // Get session id from cookie
  const sessionId = await getSessionIdFromCookie(ctx);

  // If no session id is found, remove session cookie
  if (!sessionId) {
    deleteSessionCookie(ctx);
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  // Validate session
  const { session, user } = await validateSession(sessionId);

  // If session validation fails, remove cookie
  if (!session) {
    deleteSessionCookie(ctx);
    return errorResponse(ctx, 401, 'no_session', 'warn');
  }

  ctx.set('user', user);

  // Fetch user's memberships from the database
  const memberships = await db.select(membershipSelect).from(membershipsTable).where(eq(membershipsTable.userId, user.id));
  ctx.set('memberships', memberships);

  await next();
}
