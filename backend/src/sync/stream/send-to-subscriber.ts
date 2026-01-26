import { appConfig, type RealtimeEntityType } from 'config';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { buildStreamMessage, buildStreamNotification } from './build-message';
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
 * Uses notification-based format for realtime entities (lightweight, seq-based).
 * Falls back to full message for other entity types.
 */
export async function sendToSubscriber<T extends CursoredSubscriber>(
  subscriber: T,
  event: ActivityEventWithEntity,
): Promise<void> {
  // Use lightweight notification for realtime entities with tx data
  const isRealtimeEntity = appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType);
  const hasTx = event.tx != null;

  const message = isRealtimeEntity && hasTx ? buildStreamNotification(event) : buildStreamMessage(event);

  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}
