import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { buildStreamMessage } from './build-message';
import { writeChange } from './helpers';
import type { BaseStreamSubscriber } from './types';

/**
 * Subscriber with cursor tracking.
 */
export interface CursoredSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

/**
 * Send event to a subscriber and update cursor.
 * Generic helper for all stream types.
 */
export async function sendToSubscriber<T extends CursoredSubscriber>(
  subscriber: T,
  event: ActivityEventWithEntity,
): Promise<void> {
  const message = buildStreamMessage(event);
  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}
