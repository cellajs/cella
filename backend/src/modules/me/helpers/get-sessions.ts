import type { z } from '@hono/zod-openapi';
import { desc, eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { db } from '#/db/db';
import { sessionsTable } from '#/db/schema/sessions';
import { getParsedSessionCookie } from '#/modules/auth/helpers/session';
import type { sessionSchema } from '#/modules/me/schema';

/**
 * Retrieves all sessions for a specific user, and marks the current session.
 *
 * @param ctx - Request/response context.
 * @param userId - ID of the user whose sessions are requested.
 * @returns A list of sessions, with an additional `isCurrent` flag indicating if the session is the current active session.
 */
export const getUserSessions = async (ctx: Context, userId: string): Promise<z.infer<typeof sessionSchema>[]> => {
  const sessions = await db.select().from(sessionsTable).where(eq(sessionsTable.userId, userId)).orderBy(desc(sessionsTable.createdAt));
  const { sessionToken } = await getParsedSessionCookie(ctx);

  // Destructure/remove token from response
  return sessions.map(({ token, ...session }) => ({ ...session, isCurrent: sessionToken === token }));
};
