import { appConfig, type RealtimeEntityType } from 'config';
import { isPermissionAllowed } from '#/permissions';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import type { OrgStreamSubscriber } from './types';

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
