import { isProductEntity } from 'shared';
import { signCacheToken } from '#/lib/cache-token-signer';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { buildStreamNotification, streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { canReceiveUserEvent } from './can-receive';
import { type AppStreamSubscriber, orgChannel } from './types';

/**
 * Dispatch an activity event to the user subscriber.
 * Signs the cache token with the subscriber's session before sending.
 */
async function sendToUserSubscriber(subscriber: AppStreamSubscriber, event: ActivityEventWithEntity): Promise<void> {
  const notification = buildStreamNotification(event);

  // Sign cache token with subscriber's session for defense-in-depth
  if (notification.cacheToken) {
    notification.cacheToken = signCacheToken(notification.cacheToken, subscriber.sessionToken);
  }

  logEvent('debug', 'SSE notification sent to user subscriber', {
    subscriberId: subscriber.id,
    userId: subscriber.userId,
    activityId: event.id,
    entityType: event.entityType,
    action: event.action,
  });

  await writeChange(subscriber.stream, event.id, notification);
  subscriber.cursor = event.id;
}

/**
 * Dispatch activity events to matching user subscribers.
 * Called from ActivityBus event handlers.
 *
 * All events route through org channels:
 * - Membership events → org channel (filtered to affected user)
 * - Product entity events → org channel
 * - Organization events → org channel
 */
export async function dispatchToUserSubscribers(event: ActivityEventWithEntity): Promise<void> {
  // All events require an organizationId to route via org channel
  if (!event.organizationId) {
    logEvent('debug', 'Event missing organizationId, cannot route', { activityId: event.id });
    return;
  }

  const channel = orgChannel(event.organizationId);
  const subscribers = streamSubscriberManager.getByChannel<AppStreamSubscriber>(channel);

  // Determine event type for logging
  let eventType = 'organization';
  if (event.resourceType === 'membership') {
    eventType = 'membership';
  } else if (event.entityType && isProductEntity(event.entityType)) {
    eventType = 'product entity';
  }

  logEvent('debug', `Dispatching ${eventType} event via org channel`, {
    activityId: event.id,
    action: event.action,
    entityType: event.entityType,
    orgId: event.organizationId,
    subscriberCount: subscribers.length,
  });

  for (const subscriber of subscribers) {
    if (canReceiveUserEvent(subscriber, event)) {
      try {
        await sendToUserSubscriber(subscriber, event);
      } catch (error) {
        logEvent('error', `Failed to dispatch ${eventType} event`, {
          subscriberId: subscriber.id,
          activityId: event.id,
          error,
        });
      }
    }
  }
}
