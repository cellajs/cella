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
function appNotificationKind(event: Pick<ActivityEvent, 'entityType'>): 'product' | 'membership' {
  return isProduct(event.entityType) ? 'product' : 'membership';
}

/** Type-guard form of {@link appNotificationKind}. */
export function isMembershipEvent(event: AppStreamEvent): event is AppStreamMembershipEvent {
  return appNotificationKind(event) === 'membership';
}

/**
 * The notification of an event, with no entity data. A product event with one row carries that row's `seq` and the
 * activity's `stx`; one with more rows carries the range of their sequence values and their number. A membership event
 * leaves all of these null.
 * @param event - The event to tell subscribers about.
 * @returns What every eligible subscriber receives.
 */
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

  // A message is the rows of one audience, so the first row's path speaks for all of them.
  const rows = event.rows ?? [];
  const first = rows[0]?.rowData ?? null;
  const seqs = rows.flatMap(({ seq }) => (seq === undefined ? [] : [seq]));
  const several = rows.length > 1;

  let propagation: StreamNotification['propagation'] = null;
  if (entityType) {
    const embedding = appConfig.productEmbeddings.find((e) => e.embeddedProduct === entityType);
    if (embedding) {
      // Every row of the message is named: a host learns of an embedded change by this hint and nothing else. A soft
      // delete arrives as an update, and the host drops its copy of that row.
      const update: string[] = [];
      const remove: string[] = [];
      for (const { rowData } of rows) {
        if (typeof rowData.id !== 'string') continue;
        if (event.action === 'delete' || rowData.deletedAt != null) remove.push(rowData.id);
        else update.push(rowData.id);
      }
      propagation = {
        embeddedProduct: embedding.embeddedProduct,
        hostProduct: embedding.hostProduct,
        hostColumn: embedding.hostColumn,
        update,
        remove,
      };
    }
  }
  const path = isProductEvent && first && entityType ? hierarchy.computeProductPath(entityType, first) : null;

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
    // Sequence values of one audience need not be contiguous: the range brackets them and `count` says how many rows it holds.
    seq: seqs.length > 0 ? Math.min(...seqs) : null,
    stx,
    batchUntilSeq: several && seqs.length > 0 ? Math.max(...seqs) : null,
    count: several ? rows.length : null,
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
