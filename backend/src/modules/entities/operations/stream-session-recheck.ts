import { baseDb } from '#/db/db';
import { sessionRefusal } from '#/modules/auth/sessions/operations/resolve-session';
import type { SessionModel } from '#/modules/auth/sessions/sessions-db';
import { findSessionStates } from '#/modules/auth/sessions/sessions-queries';
import type { StreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { closeStreams, type EndingReason } from '#/modules/entities/helpers/session-streams';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import { findSystemRoleHolders } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';

/** The recheck runs on a timer, without a request, on the base pool. */
const dbCtx = { var: { db: baseDb } };

/** How often the recheck reads the session behind every open stream. */
const recheckIntervalMs = 60_000;

let recheckTimer: ReturnType<typeof setInterval> | null = null;
let rechecking = false;

type SessionState = Pick<SessionModel, 'userId' | 'revokedAt' | 'revocationReason' | 'expiresAt'>;

/** Why a stream must close now, or null while its session still holds what the stream was opened with. */
function staleStreamReason(subscriber: StreamSubscriber, sessionsById: Map<string, SessionState>, systemAdmins: Set<string>): EndingReason | null {
  const session = sessionsById.get(subscriber.sessionId);
  if (!session) return 'session_deleted';
  // A revoked row carries its reason (`sessions_revocation_reason_check`); an expired one carries none.
  const refusal = sessionRefusal(session);
  if (refusal) return session.revocationReason ?? refusal;
  // The stream reads as system admin while the user holds the role and it connected from an allowed address.
  if (subscriber.isSystemAdmin !== (subscriber.systemAccessAllowed && systemAdmins.has(subscriber.userId))) {
    return subscriber.isSystemAdmin ? 'system_role_removed' : 'system_role_granted';
  }
  return null;
}

/**
 * Reads the session behind every open stream again and closes each stream that must end: its session expired, was
 * revoked between its session check and its registration (the revoke closes only the streams registered by then) or
 * went with its user, or the system role was removed or granted since the stream connected (the client reconnects on
 * `access_changed`).
 */
async function recheckStreamSessions(): Promise<void> {
  const subscribers = streamSubscriberManager.all();
  if (subscribers.length === 0) return;

  const sessions = await findSessionStates(dbCtx, { ids: [...new Set(subscribers.map((subscriber) => subscriber.sessionId))] });

  const adminIds = [
    ...new Set(subscribers.filter((subscriber) => subscriber.isSystemAdmin || subscriber.systemAccessAllowed).map(({ userId }) => userId)),
  ];
  const admins = adminIds.length === 0 ? [] : await findSystemRoleHolders(dbCtx, { userIds: adminIds, role: 'admin' });

  const sessionsById = new Map(sessions.map(({ id, ...state }) => [id, state]));
  const systemAdmins = new Set(admins.map(({ userId }) => userId));

  const stale = subscribers.flatMap((subscriber) => {
    const reason = staleStreamReason(subscriber, sessionsById, systemAdmins);
    return reason ? [{ subscriber, reason }] : [];
  });
  if (stale.length === 0) return;

  await closeStreams(stale);
  log.info('Closed streams whose session no longer holds', { closed: stale.length });
}

/** Starts the recheck with the first open stream; it stops once no stream is open. Idempotent. */
export function ensureStreamSessionRecheck(): void {
  if (recheckTimer) return;
  recheckTimer = setInterval(() => {
    if (streamSubscriberManager.size === 0) {
      if (recheckTimer) clearInterval(recheckTimer);
      recheckTimer = null;
      return;
    }
    if (rechecking) return;
    rechecking = true;
    recheckStreamSessions()
      .catch((error) => log.error('Stream session recheck failed', { error }))
      .finally(() => {
        rechecking = false;
      });
  }, recheckIntervalMs);
  // A pending recheck never keeps the process alive at shutdown.
  recheckTimer.unref();
}
