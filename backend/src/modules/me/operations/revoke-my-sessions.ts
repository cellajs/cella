import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { endSessions } from '#/modules/auth/general/helpers/end-sessions';

/**
 * Revokes the user's own sessions by id. Revoking the session behind this request is a sign-out; the others end from
 * this session. Rows stay for the sessions list; connections bound to them close through `endSessions`. Ids of
 * sessions the user does not hold, or that ended already, come back rejected. An impersonation ends none: the user's
 * sessions are theirs, and the admin leaves through stop-impersonation.
 * @throws AppError 403 `impersonation_forbidden` for an impersonation session.
 */
export async function revokeMySessionsOp(ctx: UserContext, ids: string[]) {
  const { user, sessionId: currentSessionId, session } = ctx.var;
  if (session.type === 'impersonation') throw new AppError(403, 'impersonation_forbidden', 'warn');

  const [others, own] = await Promise.all([
    endSessions(ctx, {
      userId: user.id,
      sessionIds: ids.filter((id) => id !== currentSessionId),
      reason: 'other_session',
      by: user.id,
    }),
    endSessions(ctx, {
      userId: user.id,
      sessionIds: ids.filter((id) => id === currentSessionId),
      reason: 'sign_out',
      by: user.id,
    }),
  ]);
  const data = [...others, ...own];
  const revokedIds = data.map((session) => session.id);

  return { data, rejectedIds: ids.filter((id) => !revokedIds.includes(id)), signedOut: own.length > 0 };
}
