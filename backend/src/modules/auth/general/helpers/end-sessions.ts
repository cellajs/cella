import { and, eq, gt, inArray, isNull, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { dropCachedAuth, publishAuthInvalidation } from '#/middlewares/guard/invalidate-cache';
import { authEvents } from '#/modules/auth/auth-events';
import {
  type SessionEndReason,
  type SessionModel,
  type SessionRevocationReason,
  type SessionTypes,
  sessionSafeColumns,
  sessionsTable,
} from '#/modules/auth/sessions-db';
import { deleteProviderSessionsOfUser } from '#/modules/oauth-server/oauth-server-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Which of the user's live sessions end: these ids, or all of them (optionally of one type). */
type SessionSelection = { sessionIds: string[] } | { all: true; type?: SessionTypes };

/**
 * Endings where the person leaves (signs out, ends their other sessions, turns MFA on): the authorization server's
 * sessions of the user end too, so no browser keeps answering OAuth clients for them. Sign-in housekeeping and a
 * stopped impersonation leave them.
 */
const endsProviderSessions = new Set<SessionEndReason>(['sign_out', 'other_session', 'mfa_enabled']);

export type EndSessionsOpts = SessionSelection & {
  userId: string;
  reason: SessionEndReason;
  /** The actor whose request ends the sessions; null when the server does it during a sign-in. */
  by: ActorId | null;
};

/**
 * The one way sessions end before their expiry. Stamps the user's selected live sessions with `revokedAt`,
 * `revokedBy` and `revocationReason`, drops the user's cached sessions in every process, and closes the streams bound
 * to them. A revoked session is never re-stamped, so the first ending is the one the sessions list shows; the row
 * stays until the nightly sweep. `user_deleted` follows the delete, which took the rows along: nothing is stamped,
 * and every stream of the user closes. An impersonation layered on an ended session ends with it as
 * `impersonation_stopped` (a deleted admin's rows take theirs along), since only its admin's session can present it.
 *
 * The stamps and the `auth_invalidate` message commit together, inside the caller's transaction when there is one;
 * this process drops its cache and closes the streams at the call, so call it last in a transaction.
 *
 * @param ctx - Any context with a database; the sign-in paths pass the base pool.
 * @param opts - The user, which sessions (`sessionIds` or `all`), the reason and the acting actor.
 * @returns The stamped sessions, secret stripped; empty for `user_deleted` and for sessions that had already ended.
 */
export const endSessions = async (ctx: DbContext, opts: EndSessionsOpts): Promise<SessionModel[]> => {
  const { userId, reason, by } = opts;
  if ('sessionIds' in opts && opts.sessionIds.length === 0) return [];

  const selection = 'sessionIds' in opts ? inArray(sessionsTable.id, opts.sessionIds) : undefined;
  const ofType = 'all' in opts && opts.type ? eq(sessionsTable.type, opts.type) : undefined;

  const { ended, layered } = await ctx.var.db.transaction(async (tx) => {
    const stamp = (revocationReason: SessionRevocationReason, where: SQL | undefined) =>
      tx
        .update(sessionsTable)
        .set({ revokedAt: getIsoDate(), revokedBy: by, revocationReason })
        .where(and(isNull(sessionsTable.revokedAt), gt(sessionsTable.expiresAt, getIsoDate()), where))
        .returning(sessionSafeColumns);

    const stamped =
      reason === 'user_deleted' ? [] : await stamp(reason, and(eq(sessionsTable.userId, userId), selection, ofType));
    const endedIds = stamped.map((session) => session.id);
    const stopped = endedIds.length
      ? await stamp('impersonation_stopped', inArray(sessionsTable.impersonatorSessionId, endedIds))
      : [];

    if (endsProviderSessions.has(reason)) await deleteProviderSessionsOfUser({ var: { db: tx } }, { userId });

    for (const user of new Set([userId, ...stopped.map((session) => session.userId)])) {
      await publishAuthInvalidation(tx, { user });
    }
    return { ended: stamped, layered: stopped };
  });

  dropCachedAuth({ user: userId });

  const everySession = 'all' in opts && !opts.type;
  if (everySession || ended.length > 0) {
    authEvents.emit('session.revoked', {
      userId,
      sessionIds: everySession ? 'all' : ended.map((session) => session.id),
      reason,
    });
  }
  for (const impersonation of layered) {
    dropCachedAuth({ user: impersonation.userId });
    authEvents.emit('session.revoked', {
      userId: impersonation.userId,
      sessionIds: [impersonation.id],
      reason: 'impersonation_stopped',
    });
  }
  log.info('Sessions ended', { userId, reason, count: ended.length, impersonationsStopped: layered.length });

  return ended;
};
