import type { DbContext } from '#/core/context';
import type { ActorId } from '#/db/utils/ids';
import { dropCachedSessions } from '#/middlewares/guard/session-cache';
import { authEvents } from '#/modules/auth/auth-events';
import type { SessionKind, SessionModel, SessionRevocationReason } from '#/modules/auth/sessions/sessions-db';
import { updateSessionsRevoked } from '#/modules/auth/sessions/sessions-queries';
import { deleteProviderSessionsByUser } from '#/modules/oauth-server/oauth-server-queries';
import { log } from '#/utils/logger';

/** Which of the user's live sessions are revoked: these ids, or all of them (optionally of one kind). */
type SessionSelection = { sessionIds: string[] } | { all: true; kind?: SessionKind };

/**
 * Revocations where the person leaves (signs out, revokes their other sessions, turns MFA on): the authorization
 * server's sessions of the user are deleted too, so no browser keeps answering OAuth clients for them. Sign-in
 * housekeeping leaves them.
 */
const leavingReasons = new Set<SessionRevocationReason>(['sign_out', 'other_session', 'mfa_enabled']);

type RevokeSessionsOpts = SessionSelection & {
  userId: string;
  reason: SessionRevocationReason;
  /** The actor whose request revokes the sessions; null when the server does it during a sign-in. */
  by: ActorId | null;
};

/**
 * After the commit that ended the user's sessions: drops the user's cached sessions in this process and closes the
 * streams bound to the ended ones (`all`: every one of the user). Other processes stop serving a session within the
 * session cache's 10 seconds.
 */
export const closeSessions = (userId: string, sessionIds: string[] | 'all', reason: SessionRevocationReason | 'user_deleted') => {
  dropCachedSessions(userId);
  if (sessionIds === 'all' || sessionIds.length > 0) authEvents.emit('session.revoked', { userId, sessionIds, reason });
};

/**
 * The one way sessions end before their expiry. Stamps the user's selected live sessions with `revokedAt`,
 * `revokedBy` and `revocationReason`, then closes them ({@link closeSessions}). A revoked session is never re-stamped,
 * so the first revocation is the one the sessions list shows; the row stays until the nightly sweep.
 *
 * The stamps commit inside the caller's transaction when there is one; the close happens at the call, so call it last
 * in a transaction.
 *
 * @returns The stamped sessions, secret stripped; empty for sessions that had already ended.
 */
export const revokeSessions = async (ctx: DbContext, opts: RevokeSessionsOpts): Promise<SessionModel[]> => {
  const { userId, reason, by } = opts;
  if ('sessionIds' in opts && opts.sessionIds.length === 0) return [];

  const ids = 'sessionIds' in opts ? opts.sessionIds : undefined;
  const kind = 'all' in opts ? opts.kind : undefined;

  const ended = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const stamped = await updateSessionsRevoked(txCtx, { match: { userId, ids, kind }, revokedBy: by, revocationReason: reason });

    if (leavingReasons.has(reason)) await deleteProviderSessionsByUser(txCtx, { userId });
    return stamped;
  });

  const everySession = 'all' in opts && !opts.kind;
  closeSessions(userId, everySession ? 'all' : ended.map((session) => session.id), reason);
  log.info('Sessions revoked', { userId, reason, count: ended.length });

  return ended;
};
