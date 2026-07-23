import { appConfig, type ChannelEntityType, hierarchy, pathHomeId } from 'shared';
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
 * The server's say in sync timing (RTCP-style): a spread window scaled by the org channel's
 * online audience and DB pool pressure. Identical for every subscriber, so it rides in the
 * shared (serialize-once) notification body; each client picks a deterministic slot in it.
 */
function computeSpreadWindow(organizationId: string | null): number | null {
  if (!organizationId) return null;
  const audience = streamSubscriberManager.getByChannel(`org:${organizationId}`).length;
  if (audience <= 1) return 0;
  const pressure = Math.min(dbPoolPressure(), 2);
  return Math.min(Math.round(audience * SPREAD_MS_PER_SUBSCRIBER * (1 + pressure)), MAX_SPREAD_WINDOW_MS);
}

/**
 * The app stream carries exactly two concerns: product entity sync (seq range fetch
 * on the client) and membership changes (query invalidation). This is the
 * single source of the `kind` discriminant, used both to shape the wire notification
 * and to branch dispatch/handling on either end.
 */
export function appNotificationKind(event: Pick<ActivityEvent, 'entityType'>): 'product' | 'membership' {
  return hierarchy.isProduct(event.entityType) ? 'product' : 'membership';
}

/** Type-guard form of {@link appNotificationKind}: narrows an app-stream event to the membership member. */
export function isMembershipEvent(event: AppStreamEvent): event is AppStreamMembershipEvent {
  return appNotificationKind(event) === 'membership';
}

/**
 * Build stream notification from activity event.
 * Notification-only format - no entity data included.
 *
 * For product entities:
 * - Includes stx, seq for sync engine
 *
 * For membership:
 * - stx/seq are null (memberships detected via activity scan on catchup)
 */
export function buildStreamNotification(event: ActivityEvent): StreamNotification {
  const { entityType } = event;
  const isProduct = hierarchy.isProduct(entityType);

  // Extract channelType for membership events
  const membership = event.resourceType === 'membership' ? getEventData(event, 'membership') : null;
  const channelType: ChannelEntityType | null = (membership?.channelType as ChannelEntityType | undefined) ?? null;

  // Resolve the home channel id for fetch prioritizer and unseen-count grouping: the row's deepest
  // non-null ancestor. Variable-depth rows group under their effective home. Grouping only:
  // the org sequence does not key on this.
  let channelId: string | null = null;
  if (isProduct && entityType) {
    channelId = hierarchy.resolveDeepestAncestorId(entityType, event as unknown as Record<string, unknown>);
  }

  const stx = (isProduct && event.stx) || null;

  // Derive propagation hint for embedded product types (e.g., label → task.labels).
  // For batch events, propagation is pre-set by the CDC worker. For single entity
  // events, derive from productEmbeddings config without DB queries.
  let propagation = event.propagation;
  if (!propagation && entityType) {
    const embedding = appConfig.productEmbeddings.find((e) => e.embeddedProduct === entityType);
    if (embedding) {
      const isDelete = event.action === 'delete';
      propagation = {
        embeddedProduct: embedding.embeddedProduct,
        hostProduct: embedding.hostProduct,
        hostColumn: embedding.hostColumn,
        update: isDelete ? [] : [event.subjectId!],
        remove: isDelete ? [event.subjectId!] : [],
      };
    }
  }

  // Location path of the affected rows, computed from ancestor id columns (message groups
  // are per path, so the representative row's path speaks for the whole batch).
  const rowData = event.rowData as Record<string, unknown> | null;
  const path = isProduct && rowData && entityType ? hierarchy.computeProductPath(entityType, rowData) : null;

  return {
    // Discriminant: product entities go through the seq sync path;
    // everything else on this stream is a membership change (query invalidation).
    kind: appNotificationKind(event),
    action: event.action,
    productType: isProduct ? entityType : null,
    resourceType: event.resourceType,
    subjectId: event.subjectId,
    organizationId: event.organizationId,
    tenantId: event.tenantId ?? null,
    channelType,
    path,
    channelId,
    seq: isProduct ? (event.seq ?? null) : null,
    stx,
    batchUntilSeq: event.batchUntilSeq ?? null,
    count: isProduct ? (event.count ?? null) : null,
    spreadWindow: isProduct ? computeSpreadWindow(event.organizationId) : null,
    propagation,
  };
}

/**
 * Move-out notification: the row left `movedFrom.path` (reparent). Sent ONLY to
 * subscribers who could read the old location but not the new one. For them the
 * row effectively disappeared, and no delta fetch will return it (permission-filtered),
 * so the notification itself is the removal instruction.
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
