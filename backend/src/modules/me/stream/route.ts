import { appConfig, type RealtimeEntityType } from 'config';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { canReceiveUserEvent } from './can-receive';
import { buildUserStreamMessage, enrichEventData } from './fetch-data';
import { orgChannel, type UserStreamSubscriber, userChannel } from './types';

/**
 * Dispatch an activity event to the user subscriber.
 * Enriches data with DB query since CDC row data lacks joins.
 */
async function sendToUserSubscriber(subscriber: UserStreamSubscriber, event: ActivityEventWithEntity): Promise<void> {
  // Enrich event data with full entity details from DB
  const enrichedData = await enrichEventData(event);

  const message = buildUserStreamMessage(event, enrichedData);
  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}

/**
 * Dispatch activity events to matching user subscribers.
 * Called from ActivityBus event handlers.
 *
 * Routes events based on type:
 * - Membership events → user channel (user:{userId})
 * - Product entity events → org channel (org:{orgId})
 * - Organization events → org channel (org:{orgId})
 */
export async function dispatchToUserSubscribers(event: ActivityEventWithEntity): Promise<void> {
  // For membership events, route to the user being affected via user channel
  if (event.resourceType === 'membership') {
    const membershipUserId = event.entity?.userId as string | undefined;
    if (!membershipUserId) {
      logEvent('debug', 'Membership event missing userId', { activityId: event.id });
      return;
    }

    const channel = userChannel(membershipUserId);
    const subscribers = streamSubscriberManager.getByChannel<UserStreamSubscriber>(channel);

    logEvent('debug', 'Dispatching user membership event', {
      activityId: event.id,
      action: event.action,
      userId: membershipUserId,
      subscriberCount: subscribers.length,
    });

    for (const subscriber of subscribers) {
      if (canReceiveUserEvent(subscriber, event)) {
        try {
          await sendToUserSubscriber(subscriber, event);
        } catch (error) {
          logEvent('error', 'Failed to dispatch user event', {
            subscriberId: subscriber.id,
            activityId: event.id,
            error,
          });
        }
      }
    }
    return;
  }

  // For product entity events and org events, route via org channel
  if (event.organizationId) {
    const channel = orgChannel(event.organizationId);
    const subscribers = streamSubscriberManager.getByChannel<UserStreamSubscriber>(channel);

    const isProductEntity =
      event.entityType && appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType);
    const eventType = isProductEntity ? 'product entity' : 'organization';

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
}
