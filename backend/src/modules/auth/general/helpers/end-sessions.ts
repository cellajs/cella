import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { authEvents } from '#/modules/auth/auth-events';
import {
  type SessionEndReason,
  type SessionModel,
  type SessionTypes,
  sessionSafeColumns,
  sessionsTable,
} from '#/modules/auth/sessions-db';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

/** Which of the user's live sessions end: these ids, or all of them (optionally of one type). */
type SessionSelection = { sessionIds: string[] } | { all: true; type?: SessionTypes };

export type EndSessionsOpts = SessionSelection & {
  userId: string;
  reason: SessionEndReason;
  /** The actor whose request ends the sessions; null when the server does it during a sign-in. */
  by: ActorId | null;
};

/**
 * The one way sessions end before their expiry. Stamps the user's selected live sessions with `revokedAt`,
 * `revokedBy` and `revocationReason`, drops the user's cached sessions, and closes the streams bound to them. A
 * revoked session is never re-stamped, so the first ending is the one the sessions list shows; the row stays until
 * the sweep. `user_deleted` follows the delete, which took the rows along: nothing is stamped, and every stream of
 * the user closes.
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

  const ended =
    reason === 'user_deleted'
      ? []
      : await ctx.var.db
          .update(sessionsTable)
          .set({ revokedAt: getIsoDate(), revokedBy: by, revocationReason: reason })
          .where(
            and(
              eq(sessionsTable.userId, userId),
              isNull(sessionsTable.revokedAt),
              gt(sessionsTable.expiresAt, getIsoDate()),
              selection,
              ofType,
            ),
          )
          .returning(sessionSafeColumns);

  invalidateCache.user(userId);

  const everySession = 'all' in opts && !opts.type;
  if (everySession || ended.length > 0) {
    authEvents.emit('session.revoked', {
      userId,
      sessionIds: everySession ? 'all' : ended.map((session) => session.id),
      reason,
    });
  }
  log.info('Sessions ended', { userId, reason, count: ended.length });

  return ended;
};
