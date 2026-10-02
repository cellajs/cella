import type { SessionEndReason } from '#/modules/auth/sessions/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { type StreamErrorPayload, streamSubscriberManager, writeError } from '#/modules/entities/stream';
import { log } from '#/utils/logger';
import { withinTimeout } from '#/utils/within-timeout';

/** Endings after which the browser holds a newer session: a sign-in replaced it, or the admin's own one returns. */
const endingsWithSuccessor = new Set<SessionEndReason>(['replaced', 'impersonation_stopped']);

/** What a stream bound to an ended session hears: reconnect with the newer session, or the session is gone for good. */
export const streamErrorForEnding = (reason: SessionEndReason): StreamErrorPayload =>
  endingsWithSuccessor.has(reason) ? { code: 'session_replaced', message: 'Session replaced' } : { code: 'unauthorized', message: 'Session revoked' };

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
export async function closeAppStreams(closings: { subscriber: AppStreamSubscriber; payload: StreamErrorPayload }[], failure: string): Promise<void> {
  await Promise.allSettled(
    closings.map(({ subscriber, payload }) =>
      closeAppStream(subscriber, payload).catch((error) => log.error(failure, { error, subscriberId: subscriber.id })),
    ),
  );
}
