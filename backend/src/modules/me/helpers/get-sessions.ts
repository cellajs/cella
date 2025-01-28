import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { sessionsTable } from '#/db/schema/sessions';
import { getAuthCookie } from '#/modules/auth/helpers/cookie';

export const getUserSessions = async (userId: string, ctx: Context) => {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId));
  const currentSessionId = (await getAuthCookie(ctx, 'session')) ?? '';
  const preparedSessions = sessions.map((session) => ({
    ...session,
    isCurrent: currentSessionId === session.id,
  }));

  return preparedSessions;
};
