import { appConfig, type RealtimeEntityType } from 'config';
import { checkPermission } from '#/permissions';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { logEvent } from '#/utils/logger';
import type { AppStreamSubscriber } from './types';

/**
 * Check if user subscriber should receive an event.
 *
 * For membership events:
 * - User is the subject of the membership (entity.userId matches)
 *
 * For organization events:
 * - User is a member of the org
 *
 * For product entity events (page, attachment):
 * - User has read permission via their memberships
 */
export function canReceiveUserEvent(subscriber: AppStreamSubscriber, event: ActivityEventWithEntity): boolean {
  // For membership events, check if user is the subject
  if (event.resourceType === 'membership') {
    const membershipUserId = event.entity?.userId as string | undefined;
    return membershipUserId === subscriber.userId;
  }

  // For organization events, check if user is member
  if (event.entityType === 'organization' && event.organizationId) {
    return subscriber.orgIds.has(event.organizationId);
  }

  // For product entity events (page, attachment, etc.)
  if (event.entityType && appConfig.realtimeEntityTypes.includes(event.entityType as RealtimeEntityType)) {
    return canReceiveProductEntityEvent(subscriber, event);
  }

  return false;
}

/**
 * Check if user subscriber can receive a product entity event.
 * Reuses permission logic from org stream.
 */
function canReceiveProductEntityEvent(subscriber: AppStreamSubscriber, event: ActivityEventWithEntity): boolean {
  // Must have entity ID and organization ID
  if (!event.entityId || !event.organizationId) return false;

  // Must be member of the org
  if (!subscriber.orgIds.has(event.organizationId)) return false;

  // System admins bypass ACLs
  if (subscriber.userSystemRole === 'admin') return true;

  // Check permissions using user's memberships
  const { allowed } = checkPermission(subscriber.memberships, 'read', {
    id: event.entityId,
    entityType: event.entityType as RealtimeEntityType,
    organizationId: event.organizationId,
  });

  if (!allowed) {
    logEvent('debug', 'User stream notification filtered by permission', {
      userId: subscriber.userId,
      entityType: event.entityType,
      entityId: event.entityId,
    });
  }

  return allowed;
}
