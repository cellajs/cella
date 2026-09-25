import type { SessionEndReason } from '#/modules/auth/sessions-db';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { type StreamErrorPayload, streamSubscriberManager, writeError } from '#/modules/entities/stream';

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
