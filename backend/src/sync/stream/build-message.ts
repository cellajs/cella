import { type ContextEntityType, isProductEntity } from 'shared';
import type { StreamNotification } from '#/schemas';
import { type ActivityEventWithEntity, getTypedEntity } from '#/sync/activity-bus';

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For realtime entities:
 * - Includes stx, seq, cacheToken for sync engine
 * - Client uses cacheToken to fetch entity via entity cache
 *
 * For membership:
 * - Includes seq (mSeq from contextCounters) for gap detection
 * - stx/cacheToken are null
 * - Client invalidates queries to refetch
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
    seq: event.seq ?? null,
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
