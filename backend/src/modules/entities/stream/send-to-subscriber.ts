import type { ActivityEvent } from '#/lib/activity-bus';
import type { StreamNotification } from '#/schemas';
import { log } from '#/utils/logger';
import { writeChange, writeChangeRaw } from './helpers';
import type { CursoredSubscriber } from './types';

/**
 * Takes a pre-built notification so it is not rebuilt per subscriber. `preSerialized` skips
 * JSON.stringify, for when every subscriber receives an identical notification.
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
