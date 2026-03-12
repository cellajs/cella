import { type ContextEntityType, isProductEntity } from 'shared';
import type { StreamNotification } from '#/schemas';
import { type ActivityEventWithEntity, getTypedEntity } from '#/sync/activity-bus';

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For product entities:
 * - Includes stx, seqAt, cacheToken for sync engine
 *
 * For membership:
 * - stx/cacheToken/seqAt are null (memberships detected via activity scan on catchup)
 */
export function buildStreamNotification(event: ActivityEventWithEntity): StreamNotification {
  const { entityType } = event;
  const isProduct = isProductEntity(entityType);

  // Use cache token from CDC (all users share the same token)
  const cacheToken = isProduct ? (event.cacheToken ?? null) : null;

  // Extract contextType for membership events
  const membership = event.resourceType === 'membership' ? getTypedEntity(event, 'membership') : null;
  const contextType: ContextEntityType | null = (membership?.contextType as ContextEntityType | undefined) ?? null;

  return {
    action: event.action,
    entityType: isProduct ? entityType : null,
    resourceType: event.resourceType,
    entityId: event.entityId!,
    organizationId: event.organizationId,
    contextType,
    seqAt: isProduct ? (event.seqAt ?? null) : null,
    stx:
      isProduct && event.stx
        ? {
            mutationId: event.stx.mutationId,
            sourceId: event.stx.sourceId,
            version: event.stx.version,
            fieldVersions: event.stx.fieldVersions,
          }
        : null,
    cacheToken,
  };
}
