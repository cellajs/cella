import type { SessionEndReason } from '#/modules/auth/sessions/sessions-db';
import type { StreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { endStream, writeError } from '#/modules/entities/stream/helpers';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import type { StreamErrorPayload } from '#/schemas';
import { log } from '#/utils/logger';
import { withinTimeout } from '#/utils/within-timeout';

/**
 * What a stream bound to an ended session hears: reconnect with the session a sign-in replaced it with, or the session
 * is gone for good.
 */
export function streamErrorForEnding(reason: SessionEndReason): StreamErrorPayload {
  return reason === 'replaced' ? { code: 'session_replaced', message: 'Session replaced' } : { code: 'unauthorized', message: 'Session revoked' };
}

/** How long a close waits for the client to take its error event. */
const errorWriteTimeoutMs = 1000;

/**
 * Tells the client why its stream ends, then ends it; without this the stream stays live until the client leaves. A
 * client that stopped reading never takes the error. The close waits for it at most a second. The stream still
 * answers 200, never a 204: a stock EventSource would stop at the 401 its one reconnect gets.
 */
async function closeStream(subscriber: StreamSubscriber, payload: StreamErrorPayload): Promise<void> {
  streamSubscriberManager.unregister(subscriber.id);
  await withinTimeout(writeError(subscriber.stream, payload), errorWriteTimeoutMs);
  await endStream(subscriber.stream);
}

/** Closes streams side by side, so a client that stopped reading holds up none of the others. */
export async function closeStreams(closings: { subscriber: StreamSubscriber; payload: StreamErrorPayload }[], failure: string): Promise<void> {
  await Promise.allSettled(
    closings.map(({ subscriber, payload }) =>
      closeStream(subscriber, payload).catch((error) => log.error(failure, { error, subscriberId: subscriber.id })),
    ),
  );
}

/**
 * Ends the streams that hold any of `organizationIds` with `access_changed`: their memberships changed without a
 * membership write, as when the tenant is archived or restored. Each client reconnects, and its catchup reads the
 * memberships again.
 */
export async function endOrganizationStreams(organizationIds: string[], message: string): Promise<void> {
  const streams = streamSubscriberManager.all().filter((subscriber) => organizationIds.some((id) => subscriber.organizationIds.has(id)));
  if (streams.length === 0) return;
  const payload: StreamErrorPayload = { code: 'access_changed', message };
  const closing = streams.map((subscriber) => ({ subscriber, payload }));
  await closeStreams(closing, 'Failed to close a stream after a tenant status change');
}

/**
 * Ends every stream with `resync`: the CDC worker corrected or rebuilt its books. Each client reconnects, and the
 * catch-up of the new connection brings the generation that makes it refetch.
 */
export async function resyncStreams(): Promise<void> {
  const streams = streamSubscriberManager.all();
  if (streams.length === 0) return;
  const payload: StreamErrorPayload = { code: 'resync', message: 'Sync books were rebuilt' };
  const closing = streams.map((subscriber) => ({ subscriber, payload }));
  await closeStreams(closing, 'Failed to close a stream for a resync');
  log.info('Closed every stream for a resync', { closed: streams.length });
}
