import { and, eq, inArray } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { type SessionEndReason, sessionsTable } from '#/modules/auth/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { type StreamErrorPayload, streamSubscriberManager, writeError } from '#/modules/entities/stream';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';
import { withinTimeout } from '#/utils/within-timeout';

/** Endings after which the browser holds a newer session: a sign-in replaced it, or the admin's own one returns. */
const endingsWithSuccessor = new Set<SessionEndReason>(['replaced', 'impersonation_stopped']);

/** What a stream bound to an ended session hears: reconnect with the newer session, or the session is gone for good. */
export const streamErrorForEnding = (reason: SessionEndReason): StreamErrorPayload =>
  endingsWithSuccessor.has(reason)
    ? { code: 'session_replaced', message: 'Session replaced' }
    : { code: 'unauthorized', message: 'Session revoked' };

/** How long a close waits for the client to take its error event. */
const ERROR_WRITE_TIMEOUT_MS = 1000;

/**
 * Tells the client why its stream ends, then ends it; without this the stream stays live until the client leaves. A
 * client that stopped reading never takes the error, so the close waits for it at most a second.
 */
async function closeAppStream(subscriber: AppStreamSubscriber, payload: StreamErrorPayload): Promise<void> {
  streamSubscriberManager.unregister(subscriber.id);
  await withinTimeout(writeError(subscriber.stream, payload), ERROR_WRITE_TIMEOUT_MS);
  // Abort runs the handler's onAbort cleanup, ends the response body and releases a write still waiting for the
  // client; close lets keepAlive return.
  subscriber.stream.abort();
  await subscriber.stream.close();
}

/** Closes streams side by side, so a client that stopped reading holds up none of the others. */
export async function closeAppStreams(
  closings: { subscriber: AppStreamSubscriber; payload: StreamErrorPayload }[],
  failure: string,
): Promise<void> {
  await Promise.allSettled(
    closings.map(({ subscriber, payload }) =>
      closeAppStream(subscriber, payload).catch((error) => log.error(failure, { error, subscriberId: subscriber.id })),
    ),
  );
}

/** How often the sweep re-checks the session behind every open stream. */
const SWEEP_INTERVAL_MS = 60_000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

type SessionState = Pick<
  typeof sessionsTable.$inferSelect,
  'userId' | 'revokedAt' | 'revocationReason' | 'expiresAt' | 'impersonatorSessionId'
>;

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
  if (subscriber.isSystemAdmin && !systemAdmins.has(subscriber.userId)) {
    return { code: 'access_changed', message: 'System role removed' };
  }
  return null;
};

const readSessionStates = (ids: string[]) =>
  baseDb
    .select({
      id: sessionsTable.id,
      userId: sessionsTable.userId,
      revokedAt: sessionsTable.revokedAt,
      revocationReason: sessionsTable.revocationReason,
      expiresAt: sessionsTable.expiresAt,
      impersonatorSessionId: sessionsTable.impersonatorSessionId,
    })
    .from(sessionsTable)
    .where(inArray(sessionsTable.id, ids));

/**
 * Re-checks the session behind every open app stream and closes the streams it no longer backs: the session expired,
 * was revoked where no event reached this process (another instance) or went with its user, an impersonation's admin
 * lost their session or system role, or the stream reads as system admin after the role was removed. Gaining the role
 * waits for the next connect.
 *
 * @returns How many streams it closed.
 */
export async function sweepAppStreamSessions(): Promise<number> {
  const subscribers = streamSubscriberManager.all<AppStreamSubscriber>();
  if (subscribers.length === 0) return 0;

  const sessions = await readSessionStates([...new Set(subscribers.map((subscriber) => subscriber.sessionId))]);
  const impersonatorIds = [
    ...new Set(sessions.flatMap((s) => (s.impersonatorSessionId ? [s.impersonatorSessionId] : []))),
  ];
  const impersonators = impersonatorIds.length === 0 ? [] : await readSessionStates(impersonatorIds);

  const adminIds = [
    ...new Set([
      ...subscribers.filter((s) => s.isSystemAdmin).map((s) => s.userId),
      ...impersonators.map((s) => s.userId),
    ]),
  ];
  const admins =
    adminIds.length === 0
      ? []
      : await baseDb
          .select({ userId: systemRolesTable.userId })
          .from(systemRolesTable)
          .where(and(inArray(systemRolesTable.userId, adminIds), eq(systemRolesTable.role, 'admin')));

  const sessionsById = new Map([...sessions, ...impersonators].map(({ id, ...state }) => [id, state]));
  const systemAdmins = new Set(admins.map(({ userId }) => userId));

  const stale = subscribers.flatMap((subscriber) => {
    const payload = staleStreamError(subscriber, sessionsById, systemAdmins);
    return payload ? [{ subscriber, payload }] : [];
  });
  if (stale.length === 0) return 0;

  await closeAppStreams(stale, 'Failed to close a stale stream');
  log.info('Closed streams whose session no longer holds', { closed: stale.length });
  return stale.length;
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
