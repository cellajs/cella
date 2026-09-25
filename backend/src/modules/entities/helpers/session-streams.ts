import { and, eq, inArray } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { type SessionEndReason, sessionsTable } from '#/modules/auth/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { type StreamErrorPayload, streamSubscriberManager, writeError } from '#/modules/entities/stream';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { isExpiredDate } from '#/utils/is-expired-date';
import { log } from '#/utils/logger';

/** Endings after which the browser holds a newer session: a sign-in replaced it, or the admin's own one returns. */
const endingsWithSuccessor = new Set<SessionEndReason>(['replaced', 'impersonation_stopped']);

/** What a stream bound to an ended session hears: reconnect with the newer session, or the session is gone for good. */
export const streamErrorForEnding = (reason: SessionEndReason): StreamErrorPayload =>
  endingsWithSuccessor.has(reason)
    ? { code: 'session_replaced', message: 'Session replaced' }
    : { code: 'unauthorized', message: 'Session revoked' };

/** Tells the client why its stream ends, then ends it; without this the stream stays live until the client leaves. */
export async function closeAppStream(subscriber: AppStreamSubscriber, payload: StreamErrorPayload): Promise<void> {
  streamSubscriberManager.unregister(subscriber.id);
  await writeError(subscriber.stream, payload);
  // Abort runs the handler's onAbort cleanup and ends the response body; close lets keepAlive return.
  subscriber.stream.abort();
  await subscriber.stream.close();
}

/** How often the sweep re-checks the session behind every open stream. */
const SWEEP_INTERVAL_MS = 60_000;

let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

type SessionState = Pick<typeof sessionsTable.$inferSelect, 'revokedAt' | 'revocationReason' | 'expiresAt'>;

/** Why a stream must close now, or null while its session still holds what the stream was opened with. */
const staleStreamError = (
  subscriber: AppStreamSubscriber,
  session: SessionState | undefined,
  systemAdmins: Set<string>,
): StreamErrorPayload | null => {
  if (!session) return { code: 'unauthorized', message: 'Session ended' };
  if (session.revokedAt) return streamErrorForEnding(session.revocationReason ?? 'sign_out');
  if (isExpiredDate(session.expiresAt)) return { code: 'unauthorized', message: 'Session expired' };
  if (subscriber.isSystemAdmin && !systemAdmins.has(subscriber.userId)) {
    return { code: 'access_changed', message: 'System role removed' };
  }
  return null;
};

/**
 * Re-checks the session behind every open app stream and closes the streams it no longer backs: the session expired,
 * was revoked where no event reached this process (another instance) or went with its user, or the stream reads as
 * system admin after the role was removed. Gaining the role waits for the next connect.
 *
 * @returns How many streams it closed.
 */
export async function sweepAppStreamSessions(): Promise<number> {
  const subscribers = streamSubscriberManager.all<AppStreamSubscriber>();
  if (subscribers.length === 0) return 0;

  const sessionIds = [...new Set(subscribers.map((subscriber) => subscriber.sessionId))];
  const adminIds = [...new Set(subscribers.filter((s) => s.isSystemAdmin).map((s) => s.userId))];

  const [sessions, admins] = await Promise.all([
    baseDb
      .select({
        id: sessionsTable.id,
        revokedAt: sessionsTable.revokedAt,
        revocationReason: sessionsTable.revocationReason,
        expiresAt: sessionsTable.expiresAt,
      })
      .from(sessionsTable)
      .where(inArray(sessionsTable.id, sessionIds)),
    adminIds.length === 0
      ? []
      : baseDb
          .select({ userId: systemRolesTable.userId })
          .from(systemRolesTable)
          .where(and(inArray(systemRolesTable.userId, adminIds), eq(systemRolesTable.role, 'admin'))),
  ]);

  const sessionsById = new Map(sessions.map(({ id, ...state }) => [id, state]));
  const systemAdmins = new Set(admins.map(({ userId }) => userId));

  let closed = 0;
  for (const subscriber of subscribers) {
    const error = staleStreamError(subscriber, sessionsById.get(subscriber.sessionId), systemAdmins);
    if (!error) continue;
    await closeAppStream(subscriber, error).catch((err) => {
      log.error('Failed to close a stale stream', { err, subscriberId: subscriber.id });
    });
    closed++;
  }
  if (closed > 0) log.info('Closed streams whose session no longer holds', { closed });
  return closed;
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
