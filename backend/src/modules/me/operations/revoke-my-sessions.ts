import type { UserContext } from '#/core/context';
import { revokeSessions } from '#/modules/auth/sessions/operations/revoke-sessions';
import { requireStepUp } from '#/modules/auth/step-up/operations/read-step-up';

/**
 * Revokes the user's own sessions by id. Revoking the session behind this request is a sign-out and needs nothing
 * more; ending any other session needs this one stepped up for `account`, so a copied cookie cannot end each new
 * sign-in of the owner. Rows stay for the sessions list; connections bound to them close through `revokeSessions`.
 * Ids of sessions the user does not hold, or that ended already, come back rejected.
 * @throws AppError 403 `step_up_required` when other ids are named and this session is not stepped up.
 */
export async function revokeMySessionsOp(ctx: UserContext, ids: string[]) {
  const { user, sessionId: currentSessionId } = ctx.var;

  const otherIds = ids.filter((id) => id !== currentSessionId);
  const ownIds = ids.filter((id) => id === currentSessionId);

  if (otherIds.length) await requireStepUp(ctx.var.session, 'account');

  const [others, own] = await Promise.all([
    revokeSessions(ctx, { userId: user.id, sessionIds: otherIds, reason: 'other_session', by: user.id }),
    revokeSessions(ctx, { userId: user.id, sessionIds: ownIds, reason: 'sign_out', by: user.id }),
  ]);
  const data = [...others, ...own];
  const revokedIds = data.map((session) => session.id);

  return { data, rejectedIds: ids.filter((id) => !revokedIds.includes(id)), signedOut: own.length > 0 };
}
