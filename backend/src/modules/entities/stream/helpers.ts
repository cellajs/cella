import type { SSEStreamingApi } from 'hono/streaming';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import type { StreamChange, StreamSignal } from '#/schemas';
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

/** One frame of the app stream. */
export type StreamFrame = { event: 'change'; data: StreamChange } | { event: 'signal'; data: StreamSignal };

/** Frame bytes a stream may hold unsent: the next frame closes it, and its client's reconnect catches up. */
export const maxPendingStreamBytes = 64 * 1024;

/** Rows one change frame names: 20 rows of about 700 B (an update's stx) make 14 KB, under a quarter of `maxPendingStreamBytes`. */
export const maxStreamChangeRows = 20;

/** The bytes of each stream's frames written and not yet taken by its client. */
const pendingStreamBytes = new WeakMap<SSEStreamingApi, number>();

/**
 * Ends a stream its caller unregistered. Abort runs the handler's onAbort cleanup, ends the response body and releases
 * every write still waiting for the client; close lets keepAlive return.
 */
export async function endStream(stream: SSEStreamingApi): Promise<void> {
  stream.abort();
  await stream.close();
}

/** Unregisters and ends a stream whose client stopped reading; one already ended stays as it is. */
async function closeStalledStream(subscriberId: string, stream: SSEStreamingApi, pendingBytes: number): Promise<void> {
  if (stream.aborted) return;
  log.warn('Closed a stream whose client stopped reading', { subscriberId, pendingBytes });
  streamSubscriberManager.unregister(subscriberId);
  await endStream(stream);
}

/**
 * Writes one frame to each subscriber, serialized once and side by side: a client that stopped reading holds up no
 * other and is closed at `maxPendingStreamBytes`, and a write that fails is logged for its subscriber alone.
 * @param failure - The log message of a failed write.
 */
export async function sendToSubscribers(subscribers: readonly AppStreamSubscriber[], frame: StreamFrame, failure: string): Promise<void> {
  const data = JSON.stringify(frame.data);
  const bytes = Buffer.byteLength(data);
  await Promise.all(
    subscribers.map(async ({ id: subscriberId, stream }) => {
      const pending = pendingStreamBytes.get(stream) ?? 0;
      if (pending >= maxPendingStreamBytes) return closeStalledStream(subscriberId, stream, pending);
      pendingStreamBytes.set(stream, pending + bytes);
      try {
        await stream.writeSSE({ event: frame.event, data });
        log.debug('SSE frame sent', { subscriberId, event: frame.event });
      } catch (error) {
        log.error(failure, { subscriberId, event: frame.event, error });
      } finally {
        pendingStreamBytes.set(stream, (pendingStreamBytes.get(stream) ?? 0) - bytes);
      }
    }),
  );
}

/** The `offset` event, once after connect and empty: the client's cue to post its catchup. */
export async function writeOffset(stream: SSEStreamingApi): Promise<void> {
  await stream.writeSSE({ event: 'offset', data: '' });
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
