import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { streamSubscriberManager } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { sendToPublicPageSubscriber } from './send-to-subscriber';
import { shouldReceivePublicPageEvent } from './should-receive';
import { type PublicPageSubscriber, publicPageIndexKey } from './types';

/**
 * Route page events to all public page subscribers.
 * Uses indexed lookup for O(1) filtering.
 */
export async function routeToPublicPageSubscribers(event: ActivityEventWithEntity): Promise<void> {
  // Only route page events
  if (event.entityType !== 'page') return;

  const subscribers = streamSubscriberManager.getByIndex<PublicPageSubscriber>(publicPageIndexKey);

  logEvent('debug', 'Routing public page event', {
    activityId: event.id,
    action: event.action,
    entityId: event.entityId,
    subscriberCount: subscribers.length,
    hasEntityData: !!event.entity,
  });

  for (const subscriber of subscribers) {
    const shouldReceive = shouldReceivePublicPageEvent(subscriber, event);
    logEvent('debug', 'Checking subscriber', {
      subscriberId: subscriber.id,
      cursor: subscriber.cursor,
      eventId: event.id,
      shouldReceive,
    });

    if (shouldReceive) {
      try {
        await sendToPublicPageSubscriber(subscriber, event);
      } catch (error) {
        logEvent('error', 'Failed to send public page stream message', {
          subscriberId: subscriber.id,
          activityId: event.id,
          error,
        });
      }
    }
  }
}
