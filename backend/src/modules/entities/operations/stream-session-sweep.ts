import { baseDb } from '#/db/db';
import type { SessionModel } from '#/modules/auth/sessions/sessions-db';
import { findSessionStates } from '#/modules/auth/sessions/sessions-queries';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { closeAppStreams, streamErrorForEnding } from '#/modules/entities/helpers/session-streams';
import { type BaseStreamSubscriber, type StreamErrorPayload, streamSubscriberManager } from '#/modules/entities/stream';
import { findSystemRoleHolders } from '#/modules/system/system-queries';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';

/** The sweep runs on a timer, without a request, on the base pool. */
const dbCtx = { var: { db: baseDb } };

/** App streams carry the session they authenticated with; a stream an app registers without one is not theirs. */
const isAppStream = (subscriber: BaseStreamSubscriber): subscriber is AppStreamSubscriber =>
  'sessionId' in subscriber && typeof subscriber.sessionId === 'string';

/** How often the sweep re-checks the session behind every open stream. */
const SWEEP_INTERVAL_MS = 60_000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

type SessionState = Pick<SessionModel, 'userId' | 'revokedAt' | 'revocationReason' | 'expiresAt' | 'impersonatorSessionId'>;

/** Why a stream must close now, or null while its session still holds what the stream was opened with. */
const staleStreamError = (
  subscriber: AppStreamSubscriber,
  sessionsById: Map<string, SessionState>,
  systemAdmins: Set<string>,
): StreamErrorPayload | null => {
  const session = sessionsById.get(subscriber.sessionId);
  if (!session) return { code: 'unauthorized', message: 'Session ended' };
  if (session.revokedAt) return streamErrorForEnding(session.revocationReason ?? 'sign_out');
  if (isExpiredDate(session.expiresAt)) return { code: 'unauthorized', message: 'Session expired' };
  if (session.impersonatorSessionId) {
    // An impersonation holds only while its admin's session does and the admin keeps the system role.
    const admin = sessionsById.get(session.impersonatorSessionId);
    if (!admin || admin.revokedAt || isExpiredDate(admin.expiresAt) || !systemAdmins.has(admin.userId)) {
      return { code: 'unauthorized', message: 'Impersonation ended' };
    }
  }
  // The stream reads as system admin while the user holds the role and it connected from an allowed address.
  if (subscriber.isSystemAdmin !== (subscriber.systemAccessAllowed && systemAdmins.has(subscriber.userId))) {
    return { code: 'access_changed', message: subscriber.isSystemAdmin ? 'System role removed' : 'System role granted' };
  }
  return null;
};

/**
 * Re-checks the session behind every open app stream and closes the streams it no longer backs: the session expired,
 * was revoked where no event reached this process (another instance) or went with its user, an impersonation's admin
 * lost their session or system role, or the system role was removed or granted since the stream connected (the
 * client reconnects on `access_changed`). Streams without a session, which an app may register, are left alone.
 */
async function sweepAppStreamSessions(): Promise<void> {
  const subscribers = streamSubscriberManager.all().filter(isAppStream);
  if (subscribers.length === 0) return;

  const sessions = await findSessionStates(dbCtx, { ids: [...new Set(subscribers.map((subscriber) => subscriber.sessionId))] });
  const impersonatorIds = [...new Set(sessions.flatMap((s) => (s.impersonatorSessionId ? [s.impersonatorSessionId] : [])))];
  const impersonators = impersonatorIds.length === 0 ? [] : await findSessionStates(dbCtx, { ids: impersonatorIds });

  const subscriberUserIds = subscribers.filter((s) => s.isSystemAdmin || s.systemAccessAllowed).map((s) => s.userId);
  const adminIds = [...new Set([...subscriberUserIds, ...impersonators.map((s) => s.userId)])];
  const admins = adminIds.length === 0 ? [] : await findSystemRoleHolders(dbCtx, { userIds: adminIds, role: 'admin' });

  const sessionsById = new Map([...sessions, ...impersonators].map(({ id, ...state }) => [id, state]));
  const systemAdmins = new Set(admins.map(({ userId }) => userId));

  const stale = subscribers.flatMap((subscriber) => {
    const payload = staleStreamError(subscriber, sessionsById, systemAdmins);
    return payload ? [{ subscriber, payload }] : [];
  });
  if (stale.length === 0) return;

  await closeAppStreams(stale, 'Failed to close a stale stream');
  log.info('Closed streams whose session no longer holds', { closed: stale.length });
}

/** Starts the sweep with the first open stream; it stops once no stream is open. Idempotent. */
export function ensureAppStreamSessionSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    if (streamSubscriberManager.size === 0) {
      if (sweepTimer) clearInterval(sweepTimer);
      sweepTimer = null;
      return;
    }
    if (sweeping) return;
    sweeping = true;
    sweepAppStreamSessions()
      .catch((error) => log.error('Stream session sweep failed', { error }))
      .finally(() => {
        sweeping = false;
      });
  }, SWEEP_INTERVAL_MS);
  // A pending sweep never keeps the process alive at shutdown.
  sweepTimer.unref();
}
