import { appConfig, type RealtimeEntityType } from 'config';
import { isPermissionAllowed } from '#/permissions';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import type { StreamMessage } from './schema';
import { type OrgStreamSubscriber, orgIndexKey } from './stream-types';

/**
 * Check if a subscriber should receive an event.
 * Pure function with all org-scoped filtering logic.
 *
 * Note: No cursor comparison - nanoid strings are not ordered.
 * Cursor is only used for catch-up queries, not live filtering.
 */
export function shouldReceiveOrgEvent(subscriber: OrgStreamSubscriber, event: ActivityEventWithEntity): boolean {
  // Must match org
  if (event.organizationId !== subscriber.orgId) return false;

  // Must have entity ID
  if (!event.entityId) return false;

  // Must be a realtime entity type
  if (!event.entityType || !appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType)) {
    return false;
  }

  // Filter by entity types if specified
  if (subscriber.entityTypes.length > 0) {
    if (!subscriber.entityTypes.includes(event.entityType as RealtimeEntityType)) return false;
  }

  // System admins bypass ACLs
  if (subscriber.userSystemRole === 'admin') return true;

  // Check permissions
  const { allowed } = isPermissionAllowed(subscriber.memberships, 'read', {
    id: event.entityId,
    entityType: event.entityType as RealtimeEntityType,
    organizationId: event.organizationId!,
  });

  if (!allowed) {
    logEvent('debug', 'Stream message filtered by permission', {
      userId: subscriber.userId,
      entityType: event.entityType,
      entityId: event.entityId,
    });
  }

  return allowed;
}

/**
 * Build stream message from activity event with entity data.
 */
export function buildStreamMessage(event: ActivityEventWithEntity): StreamMessage {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    tx: event.tx ?? null,
    // Include entity data for direct cache updates (from CDC Worker)
    data: event.entity ?? null,
  };
}

/**
 * Send event to a subscriber and update cursor.
 */
export async function sendToOrgSubscriber(
  subscriber: OrgStreamSubscriber,
  event: ActivityEventWithEntity,
): Promise<void> {
  const message = buildStreamMessage(event);

  await writeChange(subscriber.stream, event.id, message);

  // Update cursor
  subscriber.cursor = event.id;
}

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
