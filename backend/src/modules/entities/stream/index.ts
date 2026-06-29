/**
 * Stream infrastructure for SSE connections.
 *
 * Provides a subscriber manager with optional indexing and helper functions.
 * All routing/filtering logic lives in module handlers.
 */

export { buildStreamNotification } from './build-message';
export { createStreamDispatcher } from './dispatcher';
export {
  keepAlive,
  type StreamErrorCode,
  type StreamErrorPayload,
  writeChange,
  writeError,
  writeOffset,
} from './helpers';
export { sendNotificationToSubscriber } from './send-to-subscriber';
export { streamSubscriberManager } from './subscriber-manager';
export type { BaseStreamSubscriber, CursoredSubscriber, DispatcherConfig } from './types';
