import { appConfig, type ContextEntityType, hierarchy, isProductEntity } from 'shared';
import type { StreamNotification } from '#/schemas';
import { type ActivityEventWithEntity, getTypedRowData } from '#/sync/activity-bus';

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For product entities:
 * - Includes stx, seq, cacheToken for sync engine
 *
 * For membership:
 * - stx/cacheToken/seq are null (memberships detected via activity scan on catchup)
 */
export function buildStreamNotification(event: ActivityEventWithEntity): StreamNotification {
  const { entityType } = event;
  const isProduct = isProductEntity(entityType);

  // Use cache token from CDC (all users share the same token)
  const cacheToken = isProduct ? (event.cacheToken ?? null) : null;

  // Extract contextType for membership events
  const membership = event.resourceType === 'membership' ? getTypedRowData(event, 'membership') : null;
  const contextType: ContextEntityType | null = (membership?.contextType as ContextEntityType | undefined) ?? null;

  // Resolve context ID for unseen count grouping (e.g., task → projectId)
  let contextId: string | null = null;
  if (isProduct && entityType) {
    const parentType = hierarchy.getParent(entityType);
    if (parentType) {
      const idKey = appConfig.entityIdColumnKeys[parentType] as keyof typeof event;
      contextId = (event[idKey] as string | null) ?? null;
    }
  }

  const stx = (isProduct && event.stx) || null;

  // Derive propagation hint for source entity types (e.g., label → task.labels).
  // For batch events, propagation is pre-set by the CDC worker. For single entity
  // events, derive from entityEmbeddings config — no DB queries needed.
  let propagation = event.propagation ?? null;
  if (!propagation && entityType) {
    const embedding = appConfig.entityEmbeddings.find((e) => e.embeddedEntity === entityType);
    if (embedding) {
      const isDelete = event.action === 'delete';
      propagation = {
        sourceType: embedding.embeddedEntity,
        targetType: embedding.hostEntity,
        field: embedding.hostColumn,
        update: isDelete ? [] : [event.entityId!],
        remove: isDelete ? [event.entityId!] : [],
      };
    }
  }

  return {
    action: event.action,
    entityType: isProduct ? entityType : null,
    resourceType: event.resourceType,
    entityId: event.entityId!,
    organizationId: event.organizationId,
    tenantId: event.tenantId ?? null,
    contextType,
    contextId,
    seq: isProduct ? (event.seq ?? null) : null,
    stx,
    cacheToken,
    batchUntilSeq: event.batchUntilSeq ?? null,
    deletedIds: event.deletedIds ?? null,
    propagation,
  };
}
