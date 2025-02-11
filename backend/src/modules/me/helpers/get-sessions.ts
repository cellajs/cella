import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { sessionsTable } from '#/db/schema/sessions';
import { getAuthCookie } from '#/modules/auth/helpers/cookie';
import { encodeLowerCased } from '#/utils/oslo';

// TODO find a safer way to show sessions, a fixed schema
/**
 * Retrieves all sessions for a specific user, and marks the current session.
 *
 * @param ctx - Request/response context.
 * @param userId - ID of the user whose sessions are requested.
 * @returns A list of sessions, with an additional `isCurrent` flag indicating if the session is the current active session.
 */
export const getUserSessions = async (ctx: Context, userId: string) => {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
  const sessionToken = (await getAuthCookie(ctx, 'session')) || '';
  const hashedSessionToken = encodeLowerCased(sessionToken);

  // Destructure/remove token from response
  const preparedSessions = sessions.map(({ token, ...session }) => ({ ...session, isCurrent: hashedSessionToken === token }));

  return preparedSessions;
};
