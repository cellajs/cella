import { appConfig, type RealtimeEntityType } from 'config';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import { type BuildNotificationOptions, buildStreamNotification } from './build-message';
import { writeChange } from './helpers';
import type { BaseStreamSubscriber } from './types';

/**
 * Subscriber with cursor tracking.
 */
export interface CursoredSubscriber extends BaseStreamSubscriber {
  cursor: string | null;
}

/**
 * Subscriber with user context for cache token generation.
 */
export interface UserContextSubscriber extends CursoredSubscriber {
  userId: string;
  orgIds: Set<string>;
}

/**
 * Check if subscriber has user context for cache tokens.
 */
function hasUserContext(subscriber: CursoredSubscriber): subscriber is UserContextSubscriber {
  return 'userId' in subscriber && 'orgIds' in subscriber;
}

/**
 * Send notification to a subscriber and update cursor.
 * Uses lightweight notification format for realtime entities.
 *
 * If subscriber has user context (userId, orgIds), includes a cacheToken in the
 * notification that allows clients to access the LRU entity cache.
 */
export async function sendNotificationToSubscriber<T extends CursoredSubscriber>(
  subscriber: T,
  event: ActivityEventWithEntity,
): Promise<void> {
  // Validate this is a realtime entity with tx data
  const isRealtimeEntity = appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType);
  if (!isRealtimeEntity) {
    throw new Error(`sendNotificationToSubscriber only supports realtime entities, got: ${event.entityType}`);
  }
  if (!event.tx) {
    throw new Error(`Activity ${event.id} missing tx - realtime entities must have tx`);
  }

  // Build notification with optional cache token
  const options: BuildNotificationOptions = hasUserContext(subscriber)
    ? { userId: subscriber.userId, organizationIds: Array.from(subscriber.orgIds) }
    : {};
  const notification = buildStreamNotification(event, options);

  logEvent('debug', 'SSE notification sent to subscriber', {
    subscriberId: subscriber.id,
    activityId: event.id,
    entityType: event.entityType,
    action: event.action,
  });

  await writeChange(subscriber.stream, event.id, notification);
  subscriber.cursor = event.id;
}
