import { appConfig, type RealtimeEntityType } from 'config';
import { isPermissionAllowed } from '#/permissions';
import type { ActivityEvent } from '#/sync/activity-bus';
import { streamSubscriberManager, writeChange } from '#/sync/stream';
import { logEvent } from '#/utils/logger';
import type { StreamMessage } from './schema';
import { type OrgStreamSubscriber, orgIndexKey } from './stream-types';

/**
 * Check if a subscriber should receive an event.
 * Pure function with all org-scoped filtering logic.
 */
export function shouldReceiveOrgEvent(subscriber: OrgStreamSubscriber, event: ActivityEvent): boolean {
  // Must match org
  if (event.organizationId !== subscriber.orgId) return false;

  // Skip if before cursor
  if (subscriber.cursor && event.id <= subscriber.cursor) return false;

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
 * Build stream message from activity event.
 */
export function buildStreamMessage(event: ActivityEvent): StreamMessage {
  return {
    activityId: event.id,
    action: event.action as 'create' | 'update' | 'delete',
    entityType: event.entityType as RealtimeEntityType,
    entityId: event.entityId!,
    changedKeys: event.changedKeys ?? null,
    createdAt: event.createdAt,
    tx: event.tx ?? null,
    data: null, // Entity data from CDC Worker (when available)
  };
}

/**
 * Send event to a subscriber and update cursor.
 */
export async function sendToOrgSubscriber(subscriber: OrgStreamSubscriber, event: ActivityEvent): Promise<void> {
  const message = buildStreamMessage(event);

  await writeChange(subscriber.stream, event.id, message);

  // Update cursor
  subscriber.cursor = event.id;
}

/**
 * Route an activity event to all matching org subscribers.
 * Uses indexed lookup for O(1) org filtering.
 */
export async function routeToOrgSubscribers(event: ActivityEvent): Promise<void> {
  const orgId = event.organizationId;
  if (!orgId) return;

  // O(1) lookup by org
  const subscribers = streamSubscriberManager.getByIndex<OrgStreamSubscriber>(orgIndexKey(orgId));

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
