import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { sessionsTable } from '#/db/schema/sessions';
import { getAuthCookie } from '#/modules/auth/helpers/cookie';

// TODO find a safer way to show sessions, a fixed schema
export const getUserSessions = async (userId: string, ctx: Context) => {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
  const currentSessionId = (await getAuthCookie(ctx, 'session')) ?? '';
  // Remove token from response
  const preparedSessions = sessions.map(({ token, ...session }) => ({
    ...session,
    isCurrent: currentSessionId === session.id,
  }));

  return preparedSessions;
};
