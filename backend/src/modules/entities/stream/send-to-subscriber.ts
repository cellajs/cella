import type { ActivityEvent } from '#/lib/activity-bus';
import { log } from '#/utils/logger';
import { writeChange } from './helpers';
import type { BaseStreamSubscriber } from './types';

/**
 * Writes one notification to one subscriber. Every subscriber of an event receives the same notification, so it is
 * serialized once by the caller.
 * @param subscriber - The stream to write to.
 * @param event - The activity the notification is about; its id is the stream cursor of the frame.
 * @param serialized - The notification as JSON.
 */
export async function sendNotificationToSubscriber(subscriber: BaseStreamSubscriber, event: ActivityEvent, serialized: string): Promise<void> {
  await writeChange(subscriber.stream, event.id, serialized);
  log.debug('SSE notification sent', { subscriberId: subscriber.id, activityId: event.id, entityType: event.entityType, action: event.action });
}
