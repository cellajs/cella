import { isProductEntity } from 'shared';
import type { StreamNotification } from '#/schemas';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';

/**
 * Options for building stream notifications.
 */
export interface BuildNotificationOptions {
  // No longer needed - cacheToken comes from CDC via event
}

/**
 * Build stream notification from activity event.
 * Used for notification-based sync - lightweight payload without entity data.
 *
 * Cache token is provided by CDC and shared across all users, enabling
 * efficient server-side caching.
 */
export function buildStreamNotification(event: ActivityEventWithEntity): StreamNotification {
  const { entityType } = event;

  // Only product entity types should reach this path
  if (!isProductEntity(entityType)) {
    throw new Error(`${entityType} is not a product entity type`);
  }

  if (!event.stx) {
    throw new Error(`Activity ${event.id} missing stx - realtime entities must have stx`);
  }

  // Use cache token from CDC (all users share the same token)
  const cacheToken = event.cacheToken ?? null;

  return {
    action: event.action,
    entityType,
    resourceType: null,
    entityId: event.entityId!,
    organizationId: event.organizationId ?? null,
    contextType: null,
    seq: event.seq ?? 0,
    stx: {
      mutationId: event.stx.mutationId,
      sourceId: event.stx.sourceId,
      version: event.stx.version,
      fieldVersions: event.stx.fieldVersions,
    },
    cacheToken,
  };
}
