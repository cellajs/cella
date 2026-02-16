import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import { buildStreamNotification } from './build-message';
import { writeChange } from './helpers';
import type { BaseStreamSubscriber } from './types';

/**
 * Subscriber with cursor tracking.
 */
export interface CursoredSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

/**
 * Send notification to a subscriber and update cursor.
 * Uses lightweight notification format for realtime entities.
 * Cache token is included from CDC (shared across all users).
 */
export async function sendNotificationToSubscriber<T extends CursoredSubscriber>(
  subscriber: T,
  event: ActivityEventWithEntity,
): Promise<void> {
  // Build notification (cache token comes from CDC via event)
  const notification = buildStreamNotification(event);

  logEvent('debug', 'SSE notification sent to subscriber', {
    subscriberId: subscriber.id,
    activityId: event.id,
    entityType: event.entityType,
    action: event.action,
  });

  await writeChange(subscriber.stream, event.id, notification);
  subscriber.cursor = event.id;
}
