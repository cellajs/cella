import type { SSEStreamingApi } from 'hono/streaming';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { BaseStreamSubscriber } from '#/modules/entities/stream/types';
import type { StreamNotification } from '#/schemas';
import { log } from '#/utils/logger';

/**
 * Stable codes so a client can react beyond a generic transport failure. The client treats `unauthorized`,
 * `forbidden` and `tenant_revoked` as final; `session_replaced` means the browser holds a newer session to reconnect
 * with, and `access_changed` that the session holds but the stream's access must be computed again. `resync` means the
 * CDC worker corrected or rebuilt its books: the client reconnects, and its catch-up brings the new generation.
 */
export type StreamErrorCode = 'unauthorized' | 'forbidden' | 'tenant_revoked' | 'session_replaced' | 'access_changed' | 'resync';

export interface StreamErrorPayload {
  code: StreamErrorCode;
  message: string;
}

/**
 * Writes one notification to each subscriber as a `change` event, serialized once and side by side: a client that
 * stopped reading holds up no other, and a write that fails is logged for its subscriber alone.
 * @param event - The activity the notification is about; its id is the stream cursor of the frame.
 * @param failure - The log message of a failed write.
 */
export async function sendToSubscribers(
  subscribers: readonly BaseStreamSubscriber[],
  event: ActivityEvent,
  notification: StreamNotification,
  failure: string,
): Promise<void> {
  const data = JSON.stringify(notification);
  await Promise.all(
    subscribers.map(async (subscriber) => {
      try {
        await subscriber.stream.writeSSE({ event: 'change', id: event.id, data });
        log.debug('SSE notification sent', { subscriberId: subscriber.id, activityId: event.id, entityType: event.entityType, action: event.action });
      } catch (error) {
        log.error(failure, { subscriberId: subscriber.id, activityId: event.id, error });
      }
    }),
  );
}

/** The `offset` event, once after connect: the newest activity id the stream starts after, and the client's signal to post its catchup. */
export async function writeOffset(stream: SSEStreamingApi, cursor: string | null): Promise<void> {
  await stream.writeSSE({ event: 'offset', data: cursor ?? '' });
}

/** The `error` event that tells the client why its stream ends; the caller ends the stream after it. */
export async function writeError(stream: SSEStreamingApi, payload: StreamErrorPayload): Promise<void> {
  await stream.writeSSE({ event: 'error', data: JSON.stringify(payload) });
}

/**
 * What a ping of the app stream says while no CDC worker has been reading for a minute. Any other ping is empty: live
 * changes arrive as they happen.
 */
export const workerAwayPing = 'worker_away';

/**
 * A `ping` event. EventSource hands a named event to client code and hides a comment line, so this is how a client
 * tells a live stream from a dead one. It also keeps the socket and any proxies from idling out. Its data is the one
 * standing fact a stream has to tell, repeated with every ping so a client that missed it hears it at the next.
 */
async function writePing(stream: SSEStreamingApi, data: string): Promise<void> {
  await stream.writeSSE({ event: 'ping', data });
}

/**
 * Sends a ping at once and then every 30 seconds, until the client aborts or the server closes the stream; `write`
 * swallows errors, so the flags are the only exit.
 * @param stream - The stream to keep.
 * @param pingData - Read for every ping; empty by default.
 * @param intervalMs - The time between two pings.
 */
export async function keepAlive(stream: SSEStreamingApi, pingData: () => string = () => '', intervalMs = 30000): Promise<void> {
  while (!stream.closed && !stream.aborted) {
    await writePing(stream, pingData());
    await stream.sleep(intervalMs);
  }
}
