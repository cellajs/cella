import type { RealtimeEntityType } from 'config';
import type { ActivityEvent } from '#/sync/activity-bus';
import { streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import { type PublicPageSubscriber, publicPageIndexKey } from './public-stream-types';

/**
 * Check if a public subscriber should receive this event.
 * Pure function - no permission check since it's public.
 */
export function shouldReceivePublicPageEvent(subscriber: PublicPageSubscriber, event: ActivityEvent): boolean {
  // Only pages
  if (event.entityType !== 'page') return false;

  // Must have entity ID
  if (!event.entityId) return false;

  // Skip if before cursor
  if (subscriber.cursor && event.id <= subscriber.cursor) return false;

  return true;
}

/**
 * Build a minimal public stream message (no sensitive data).
 */
export function buildPublicPageMessage(event: ActivityEvent) {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    // No tx metadata for public stream
    tx: null,
    // No entity data - client fetches via public getPage endpoint
    data: null,
  };
}

/**
 * Send event to a public subscriber and update cursor.
 */
export async function sendToPublicPageSubscriber(
  subscriber: PublicPageSubscriber,
  event: ActivityEvent,
): Promise<void> {
  const message = buildPublicPageMessage(event);
  await writeChange(subscriber.stream, event.id, message);
  subscriber.cursor = event.id;
}

/**
 * Route page events to all public page subscribers.
 * Uses indexed lookup for O(1) filtering.
 */
export async function routeToPublicPageSubscribers(event: ActivityEvent): Promise<void> {
  // Only route page events
  if (event.entityType !== 'page') return;

  const subscribers = streamSubscriberManager.getByIndex<PublicPageSubscriber>(publicPageIndexKey);

  for (const subscriber of subscribers) {
    if (shouldReceivePublicPageEvent(subscriber, event)) {
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
