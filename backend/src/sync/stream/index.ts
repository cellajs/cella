/**
 * Stream infrastructure for SSE connections.
 *
 * Provides a subscriber manager with optional indexing and helper functions.
 * All routing/filtering logic lives in module handlers.
 */

export { keepAlive, writeChange, writeOffset, writePing } from './helpers';
export { streamSubscriberManager } from './subscriber-manager';
export type { BaseStreamSubscriber } from './types';
