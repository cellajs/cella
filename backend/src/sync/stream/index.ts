/**
 * Stream infrastructure for SSE connections.
 *
 * Provides a subscriber manager with optional indexing and helper functions.
 * All routing/filtering logic lives in module handlers.
 */

export { buildStreamNotification } from './build-message';
export { createStreamDispatcher, type DispatcherConfig } from './dispatcher';
export { keepAlive, writeChange, writeOffset, writePing } from './helpers';
export { type CursoredSubscriber, sendNotificationToSubscriber } from './send-to-subscriber';
export { streamSubscriberManager } from './subscriber-manager';
export type { BaseStreamSubscriber } from './types';
