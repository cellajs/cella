import type { RealtimeEntityType } from 'config';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { type PublicPageSubscriber, publicPageIndexKey } from './public-stream-types';

/**
 * Check if a public subscriber should receive this event.
 * Pure function - no permission check since it's public.
 *
 * Note: No cursor comparison - nanoid strings are not ordered.
 * Cursor is only used for catch-up queries, not live filtering.
 */
export function shouldReceivePublicPageEvent(
  _subscriber: PublicPageSubscriber,
  event: ActivityEventWithEntity,
): boolean {
  // Only pages
  if (event.entityType !== 'page') return false;

  // Must have entity ID
  if (!event.entityId) return false;

  return true;
}

/**
 * Build public stream message with entity data.
 */
export function buildPublicPageMessage(event: ActivityEventWithEntity) {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    // No tx metadata for public stream
    tx: null,
    // Include entity data for direct cache updates (from CDC Worker)
    data: event.entity ?? null,
  };
}

/**
 * Send event to a public subscriber and update cursor.
 */
export async function sendToPublicPageSubscriber(
  subscriber: PublicPageSubscriber,
  event: ActivityEventWithEntity,
): Promise<void> {
  const message = buildPublicPageMessage(event);
  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}

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
