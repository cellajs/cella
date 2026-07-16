import { appConfig, type ChannelEntityType, hierarchy, isProductEntity, resolveDeepestAncestorId } from 'shared';
import { dbPoolPressure } from '#/db/db';
import { type ActivityEvent, getEventData } from '#/lib/activity-bus';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent, AppStreamMembershipEvent } from './types';

/** ~20ms of client spread per online org subscriber: 10 users → near-instant, 3000 → ~60s. */
const SPREAD_MS_PER_SUBSCRIBER = 20;
/** Never let a client lag more than this behind by server suggestion (client tiers cap lower). */
const MAX_SYNC_WINDOW_MS = 120_000;

/**
 * The server's say in sync timing (RTCP-style): a spread window scaled by the org channel's
 * online audience and DB pool pressure. Identical for every subscriber, so it rides in the
 * shared (serialize-once) notification body; each client picks a deterministic slot in it.
 */
function computeSyncWindow(organizationId: string | null): number | null {
  if (!organizationId) return null;
  const audience = streamSubscriberManager.getByChannel(`org:${organizationId}`).length;
  if (audience <= 1) return 0;
  const pressure = Math.min(dbPoolPressure(), 2);
  return Math.min(Math.round(audience * SPREAD_MS_PER_SUBSCRIBER * (1 + pressure)), MAX_SYNC_WINDOW_MS);
}

/**
 * The app stream carries exactly two concerns: product entity sync (seq range fetch
 * on the client) and membership changes (query invalidation). This is the
 * single source of the `kind` discriminant, used both to shape the wire notification
 * and to branch dispatch/handling on either end.
 */
export function appNotificationKind(event: Pick<ActivityEvent, 'entityType'>): 'entity' | 'membership' {
  return isProductEntity(event.entityType) ? 'entity' : 'membership';
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
  const isProduct = isProductEntity(entityType);

  // Extract channelType for membership events
  const membership = event.resourceType === 'membership' ? getEventData(event, 'membership') : null;
  const channelType: ChannelEntityType | null = (membership?.channelType as ChannelEntityType | undefined) ?? null;

  // Resolve context ID for seq-cursor and unseen-count grouping: the row's deepest non-null
  // ancestor. Variable-depth rows group under their effective home. The client buckets
  // by this id, which must match CDC's seq scope.
  let channelId: string | null = null;
  if (isProduct && entityType) {
    channelId = resolveDeepestAncestorId(hierarchy, entityType, event as unknown as Record<string, unknown>);
  }

  const stx = (isProduct && event.stx) || null;

  // Derive propagation hint for source entity types (e.g., label → task.labels).
  // For batch events, propagation is pre-set by the CDC worker. For single entity
  // events, derive from entityEmbeddings config without DB queries.
  let propagation = event.propagation;
  if (!propagation && entityType) {
    const embedding = appConfig.entityEmbeddings.find((e) => e.embeddedEntity === entityType);
    if (embedding) {
      const isDelete = event.action === 'delete';
      propagation = {
        sourceType: embedding.embeddedEntity,
        targetType: embedding.hostEntity,
        field: embedding.hostColumn,
        update: isDelete ? [] : [event.subjectId!],
        remove: isDelete ? [event.subjectId!] : [],
      };
    }
  }

  return {
    // Discriminant: product entities go through the seq sync path;
    // everything else on this stream is a membership change (query invalidation).
    kind: appNotificationKind(event),
    action: event.action,
    entityType: isProduct ? entityType : null,
    resourceType: event.resourceType,
    subjectId: event.subjectId,
    organizationId: event.organizationId,
    tenantId: event.tenantId ?? null,
    channelType,
    channelId,
    seq: isProduct ? (event.seq ?? null) : null,
    stx,
    batchUntilSeq: event.batchUntilSeq ?? null,
    syncWindow: isProduct ? computeSyncWindow(event.organizationId) : null,
    propagation,
  };
}
