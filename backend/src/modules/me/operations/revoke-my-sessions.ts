import type { UserContext } from '#/core/context';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';
import { validateSession } from '#/modules/auth/general/helpers/session';

/**
 * Revokes the user's own sessions by id. Revoking the session behind this request is a sign-out; the others end from
 * this session. Rows stay for the sessions list; connections bound to them close through `endSessions`. Ids of
 * sessions the user does not hold, or that ended already, come back rejected.
 */
export async function revokeMySessionsOp(ctx: UserContext, ids: string[]) {
  const { user, sessionToken } = ctx.var;
  const { session: currentSession } = await validateSession(sessionToken);

  const [others, own] = await Promise.all([
    endSessions(ctx, {
      userId: user.id,
      sessionIds: ids.filter((id) => id !== currentSession.id),
      reason: 'other_session',
      by: user.id,
    }),
    endSessions(ctx, {
      userId: user.id,
      sessionIds: ids.filter((id) => id === currentSession.id),
      reason: 'sign_out',
      by: user.id,
    }),
  ]);
  const data = [...others, ...own];
  const revokedIds = data.map((session) => session.id);

  return { data, rejectedIds: ids.filter((id) => !revokedIds.includes(id)), signedOut: own.length > 0 };
}
