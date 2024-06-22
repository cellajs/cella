import type { Context } from 'hono';
import { auth } from '../../../db/lucia';

export const getPreparedSessions = async (userId: string, ctx: Context) => {
  const sessions = await auth.getUserSessions(userId);
  const currentSessionId = auth.readSessionCookie(ctx.req.raw.headers.get('Cookie') ?? '');
  const preparedSessions = sessions.map((session) => ({
    ...session,
    type: 'DESKTOP' as const,
    current: session.id === currentSessionId,
  }));
  return preparedSessions;
};
