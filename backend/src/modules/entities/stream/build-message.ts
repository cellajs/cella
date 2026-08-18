import { appConfig, type ChannelEntityType, hierarchy, isProduct, pathHomeId } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { dbPoolPressure } from '#/db/db';
import { type ActivityEvent, getEventData } from '#/lib/activity-bus';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent, AppStreamMembershipEvent } from './types';

/** ~20ms of client spread per online org subscriber: 10 users → near-instant, 3000 → ~60s. */
const SPREAD_MS_PER_SUBSCRIBER = 20;
/** Never let a client lag more than this behind by server suggestion (client tiers cap lower). */
const MAX_SPREAD_WINDOW_MS = 120_000;

/**
 * A spread window scaled by the org channel's online audience and DB pool pressure. Identical for
 * every subscriber, so it rides in the serialize-once body and each client picks a slot in it.
 */
function computeSpreadWindow(organizationId: string | null): number | null {
  if (!organizationId) return null;
  const audience = streamSubscriberManager.getByChannel(`org:${organizationId}`).length;
  if (audience <= 1) return 0;
  const pressure = Math.min(dbPoolPressure(), 2);
  return Math.min(Math.round(audience * SPREAD_MS_PER_SUBSCRIBER * (1 + pressure)), MAX_SPREAD_WINDOW_MS);
}

/** The single source of the `kind` discriminant: product entity sync, or membership change. */
export function appNotificationKind(event: Pick<ActivityEvent, 'entityType'>): 'product' | 'membership' {
  return isProduct(event.entityType) ? 'product' : 'membership';
}

/** Type-guard form of {@link appNotificationKind}. */
export function isMembershipEvent(event: AppStreamEvent): event is AppStreamMembershipEvent {
  return appNotificationKind(event) === 'membership';
}

/** No entity data. Product events carry `stx` and `seq`; membership events leave both null. */
export function buildStreamNotification(event: ActivityEvent): StreamNotification {
  const { entityType } = event;
  const isProductEvent = isProduct(entityType);

  const membership = event.resourceType === 'membership' ? getEventData(event, 'membership') : null;
  const channelType: ChannelEntityType | null = (membership?.channelType as ChannelEntityType | undefined) ?? null;

  // Home channel id for fetch prioritizing and unseen grouping; the org sequence does not key on it.
  let channelId: string | null = null;
  if (isProductEvent && entityType) {
    channelId = hierarchy.resolveDeepestAncestorId(entityType, asRecord(event));
  }

  const stx = (isProductEvent && event.stx) || null;

  // Message groups are per path, so the representative row's path speaks for the whole batch.
  const rowData = event.rowData as Record<string, unknown> | null;

  // Batch events arrive with the hint pre-set by CDC; single-entity events derive it from config.
  let propagation = event.propagation;
  if (!propagation && entityType) {
    const embedding = appConfig.productEmbeddings.find((e) => e.embeddedProduct === entityType);
    if (embedding) {
      // Soft deletes arrive as updates; the host must drop its embedded copy, so hint a removal.
      const isRemoval = event.action === 'delete' || rowData?.deletedAt != null;
      propagation = {
        embeddedProduct: embedding.embeddedProduct,
        hostProduct: embedding.hostProduct,
        hostColumn: embedding.hostColumn,
        update: isRemoval ? [] : [event.subjectId!],
        remove: isRemoval ? [event.subjectId!] : [],
      };
    }
  }
  const path = isProductEvent && rowData && entityType ? hierarchy.computeProductPath(entityType, rowData) : null;

  return {
    // Product entities take the seq sync path; everything else here is a membership change.
    kind: appNotificationKind(event),
    action: event.action,
    productType: isProductEvent ? entityType : null,
    resourceType: event.resourceType,
    subjectId: event.subjectId,
    organizationId: event.organizationId,
    tenantId: event.tenantId ?? null,
    channelType,
    path,
    channelId,
    seq: isProductEvent ? (event.seq ?? null) : null,
    stx,
    batchUntilSeq: event.batchUntilSeq ?? null,
    count: isProductEvent ? (event.count ?? null) : null,
    spreadWindow: isProductEvent ? computeSpreadWindow(event.organizationId) : null,
    propagation,
  };
}

/**
 * Sent only to subscribers who could read the old location but not the new one: no delta fetch
 * returns the row for them, so this notification is itself the removal instruction.
 */
export function buildMoveOutNotification(event: ActivityEvent, movedFrom: Record<string, unknown>): StreamNotification {
  const base = buildStreamNotification(event);
  const oldPath = event.entityType ? hierarchy.computeProductPath(event.entityType, movedFrom) : null;
  return {
    ...base,
    action: 'moveOut',
    path: oldPath,
    // The old path's deepest segment is the old home channel (unseen grouping).
    channelId: oldPath ? pathHomeId(oldPath) : base.channelId,
    // No range to fetch: the removal is the payload.
    batchUntilSeq: null,
    count: 1,
    stx: null,
    propagation: null,
  };
}
