import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { streamSubscriberManager } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { sendToOrgSubscriber } from './send-to-subscriber';
import { shouldReceiveOrgEvent } from './should-receive';
import { type OrgStreamSubscriber, orgIndexKey } from './types';

/**
 * Route an activity event to all matching org subscribers.
 * Uses indexed lookup for O(1) org filtering.
 */
export async function routeToOrgSubscribers(event: ActivityEventWithEntity): Promise<void> {
  const orgId = event.organizationId;
  if (!orgId) return;

  // O(1) lookup by org
  const subscribers = streamSubscriberManager.getByIndex<OrgStreamSubscriber>(orgIndexKey(orgId));

  logEvent('debug', 'Routing org event', {
    activityId: event.id,
    action: event.action,
    entityId: event.entityId,
    orgId,
    subscriberCount: subscribers.length,
    hasEntityData: !!event.entity,
  });

  for (const subscriber of subscribers) {
    if (shouldReceiveOrgEvent(subscriber, event)) {
      try {
        await sendToOrgSubscriber(subscriber, event);
      } catch (error) {
        logEvent('error', 'Failed to send stream message', {
          subscriberId: subscriber.id,
          activityId: event.id,
          error,
        });
      }
    }
  }
}
