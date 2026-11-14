import type { SessionRevocationReason } from '#/modules/auth/sessions/sessions-db';
import type { StreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { endStream, writeError } from '#/modules/entities/stream/helpers';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import type { StreamErrorPayload } from '#/schemas';
import { log } from '#/utils/logger';
import { withinTimeout } from '#/utils/within-timeout';

/**
 * Why the server closes a stream: its session was revoked, went with its user, is gone or expired; its access must be
 * computed again; or the sync books moved.
 */
export type EndingReason =
  | SessionRevocationReason
  | 'user_deleted'
  | 'session_revoked'
  | 'session_expired'
  | 'session_deleted'
  | 'system_role_removed'
  | 'system_role_granted'
  | 'memberships_changed'
  | 'tenant_status_changed'
  | 'resync';

const revoked: StreamErrorPayload = { code: 'unauthorized', message: 'Session revoked' };

/** What a closing stream hears: `session_replaced` reconnects with the newer session, `unauthorized` ends it for good. */
const streamEndings: Record<EndingReason, StreamErrorPayload> = {
  sign_out: revoked,
  other_session: revoked,
  mfa_enabled: revoked,
  session_cap: revoked,
  user_deleted: revoked,
  session_revoked: revoked,
  replaced: { code: 'session_replaced', message: 'Session replaced' },
  session_expired: { code: 'unauthorized', message: 'Session expired' },
  session_deleted: { code: 'unauthorized', message: 'Session ended' },
  system_role_removed: { code: 'access_changed', message: 'System role removed' },
  system_role_granted: { code: 'access_changed', message: 'System role granted' },
  memberships_changed: { code: 'access_changed', message: 'Memberships changed while the stream connected' },
  tenant_status_changed: { code: 'access_changed', message: "The tenant's status changed" },
  resync: { code: 'resync', message: 'Sync books were rebuilt' },
};

/** How long a close waits for the client to take its error event. */
const errorWriteTimeoutMs = 1000;

/**
 * Tells the client why its stream ends, then ends it; without this the stream stays live until the client leaves. A
 * client that stopped reading never takes the error. The close waits for it at most a second. The stream still
 * answers 200, never a 204: a stock EventSource would stop at the 401 its one reconnect gets.
 */
async function closeStream(subscriber: StreamSubscriber, reason: EndingReason): Promise<void> {
  streamSubscriberManager.unregister(subscriber.id);
  await withinTimeout(writeError(subscriber.stream, streamEndings[reason]), errorWriteTimeoutMs);
  await endStream(subscriber.stream);
}

/** Closes streams side by side, so a client that stopped reading holds up none of the others. */
export async function closeStreams(closings: { subscriber: StreamSubscriber; reason: EndingReason }[]): Promise<void> {
  await Promise.allSettled(
    closings.map(({ subscriber, reason }) =>
      closeStream(subscriber, reason).catch((error) => log.error('Failed to close a stream', { error, reason, subscriberId: subscriber.id })),
    ),
  );
}

/**
 * Closes the open streams `filter` picks, all for one reason.
 * @returns How many streams it closed.
 */
async function closeStreamsWhere(filter: (subscriber: StreamSubscriber) => boolean, reason: EndingReason): Promise<number> {
  const closings = streamSubscriberManager
    .all()
    .filter(filter)
    .map((subscriber) => ({ subscriber, reason }));
  await closeStreams(closings);
  return closings.length;
}

/**
 * Closes the streams that hold any of `organizationIds`: their memberships changed without a membership write, as when
 * the tenant is deleted or restored. Each client reconnects, and its catchup reads the memberships again.
 */
export async function closeOrganizationStreams(organizationIds: string[]): Promise<void> {
  await closeStreamsWhere((subscriber) => organizationIds.some((id) => subscriber.organizationIds.has(id)), 'tenant_status_changed');
}

/**
 * Closes every stream with `resync`: the CDC worker corrected or rebuilt its books. Each client reconnects, and the
 * catch-up of the new connection brings the generation that makes it refetch.
 */
export async function resyncStreams(): Promise<void> {
  const closed = await closeStreamsWhere(() => true, 'resync');
  if (closed > 0) log.info('Closed every stream for a resync', { closed });
}
