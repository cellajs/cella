import { isContextEntity, isRealtimeEntity, type RealtimeEntityType } from 'config';
import { checkPermission } from '#/permissions';
import { type ActivityEventWithEntity, getTypedEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import type { AppStreamSubscriber } from './types';

/**
 * Check if user subscriber should receive an event.
 *
 * For membership events:
 * - User is the subject of the membership (entity.userId matches)
 *
 * For context entity events (organization, etc.):
 * - User is a member of the org
 *
 * For product entity events (page, attachment):
 * - User has read permission via their memberships
 */
export function canReceiveUserEvent(subscriber: AppStreamSubscriber, event: ActivityEventWithEntity): boolean {
  // For membership events, check if user is the subject
  if (event.resourceType === 'membership') {
    const membership = getTypedEntity(event, 'membership');
    return membership?.userId === subscriber.userId;
  }

  const { entityType } = event;

  // For context entity events, check if user is member of the organization
  if (entityType && isContextEntity(entityType) && event.organizationId) {
    return subscriber.orgIds.has(event.organizationId);
  }

  // For product entity events (page, attachment, etc.)
  if (isRealtimeEntity(entityType)) {
    return canReceiveProductEntityEvent(subscriber, event, entityType);
  }

  return false;
}

/**
 * Check if user subscriber can receive a product entity event.
 * Reuses permission logic from org stream.
 */
function canReceiveProductEntityEvent(
  subscriber: AppStreamSubscriber,
  event: ActivityEventWithEntity,
  entityType: RealtimeEntityType,
): boolean {
  // Must have entity ID and organization ID
  if (!event.entityId || !event.organizationId) return false;

  // Defense in depth: user must be member of the organization
  if (!subscriber.orgIds.has(event.organizationId)) return false;

  const eventEntity = {
    id: event.entityId,
    entityType,
    organizationId: event.organizationId,
  };

  // Check permissions using user's memberships
  const { isAllowed } = checkPermission(subscriber.memberships, 'read', eventEntity, {
    systemRole: subscriber.userSystemRole,
  });

  if (!isAllowed) {
    logEvent('debug', 'User stream notification filtered by permission', {
      userId: subscriber.userId,
      entityType,
      entityId: event.entityId,
    });
  }

  return isAllowed;
}
