import type { ActivityEvent } from '#/lib/activity-bus';
import type { StreamNotification } from '#/schemas';
import { log } from '#/utils/logger';
import { writeChange, writeChangeRaw } from './helpers';
import type { CursoredSubscriber } from './types';

/**
 * Send notification to a subscriber and update cursor.
 * Accepts a pre-built notification to avoid redundant builds across subscribers.
 * When preSerialized is provided, skips JSON.stringify (used when all subscribers
 * receive identical notifications without per-subscriber transforms).
 */
export async function sendNotificationToSubscriber<T extends CursoredSubscriber, E extends ActivityEvent>(
  subscriber: T,
  event: E,
  notification: StreamNotification,
  transformNotification?: (notification: StreamNotification, subscriber: T) => StreamNotification,
  preSerialized?: string,
): Promise<void> {
  if (preSerialized) {
    await writeChangeRaw(subscriber.stream, event.id, preSerialized);
  } else {
    const final = transformNotification ? transformNotification(notification, subscriber) : notification;
    await writeChange(subscriber.stream, event.id, final);
  }

  log.debug('SSE notification sent', {
    subscriberId: subscriber.id,
    activityId: event.id,
    entityType: event.entityType,
    action: event.action,
  });

  subscriber.cursor = event.id;
}
