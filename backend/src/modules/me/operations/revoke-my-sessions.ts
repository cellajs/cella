import { eq, inArray } from 'drizzle-orm';
import type { UserContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { authEvents } from '#/modules/auth/auth-events';
import { revokeSessions } from '#/modules/auth/auth-queries';
import { validateSession } from '#/modules/auth/general/helpers/session';
import { type SessionRevocationReason, sessionsTable } from '#/modules/auth/sessions-db';
import { log } from '#/utils/logger';

/**
 * Revokes the user's own sessions by id. Revoking the session behind this request is a sign-out; the others end from
 * this session. Rows stay for the sessions list; connections bound to them close through `session.revoked`. Ids of
 * sessions the user does not hold, or that were revoked already, come back rejected.
 */
export async function revokeMySessionsOp(ctx: UserContext, ids: string[]) {
  const { user, sessionToken } = ctx.var;
  const { session: currentSession } = await validateSession(sessionToken);

  const revokeBatch = (sessionIds: string[], reason: SessionRevocationReason) =>
    sessionIds.length === 0
      ? Promise.resolve([])
      : revokeSessions(ctx, {
          filters: [inArray(sessionsTable.id, sessionIds), eq(sessionsTable.userId, user.id)],
          reason,
          revokedBy: user.id,
        });

  const [others, own] = await Promise.all([
    revokeBatch(
      ids.filter((id) => id !== currentSession.id),
      'other_session',
    ),
    revokeBatch(
      ids.filter((id) => id === currentSession.id),
      'sign_out',
    ),
  ]);
  const data = [...others, ...own];

  invalidateCache.user(user.id);

  const revokedIds = data.map((session) => session.id);
  if (revokedIds.length > 0) {
    authEvents.emit('session.revoked', { userId: user.id, sessionIds: revokedIds });
    log.info('Sessions revoked', { userId: user.id, count: revokedIds.length, signedOut: own.length > 0 });
  }

  return { data, rejectedIds: ids.filter((id) => !revokedIds.includes(id)), signedOut: own.length > 0 };
}
