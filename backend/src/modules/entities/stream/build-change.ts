import { appConfig, hierarchy, pathHomeId } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { dbPoolPressure } from '#/db/db';
import type { ActivityRow } from '#/lib/activity-bus';
import { maxStreamChangeIds, maxStreamChangeRows } from '#/modules/entities/stream/helpers';
import { organizationTopic, streamSubscriberManager } from '#/modules/entities/stream/subscriber-manager';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { StreamChange } from '#/schemas';

/** ~20ms of client spread per online org subscriber: 10 users → near-instant, 1500 → the cap. */
const spreadMsPerSubscriber = 20;
/** The client's background tier waits at most this long, so a wider window would pile the slots past it at its end. */
const maxSpreadWindowMs = 30_000;

/**
 * A spread window scaled by the organization topic's online audience and DB pool pressure. Identical for
 * every subscriber, so it rides in the serialize-once body and each client picks a slot in it.
 */
function computeSpreadWindow(organizationId: string): number {
  const audience = streamSubscriberManager.getByTopic(organizationTopic(organizationId)).length;
  if (audience <= 1) return 0;
  const pressure = Math.min(dbPoolPressure(), 2);
  return Math.min(Math.round(audience * spreadMsPerSubscriber * (1 + pressure)), maxSpreadWindowMs);
}

/**
 * What a frame over the row cap names: the sequence range of a create's or update's rows, none of a delete's, and the
 * rows' ids up to `maxStreamChangeIds`.
 */
function overflowOf(action: StreamChange['action'], entries: StreamChange['rows']): NonNullable<StreamChange['overflow']> {
  const subjectIds = entries.length <= maxStreamChangeIds ? entries.map(({ subjectId }) => subjectId) : null;
  if (action === 'delete') return { afterSeq: null, untilSeq: null, subjectIds };
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const { seq } of entries) {
    if (seq === null) continue;
    low = Math.min(low, seq);
    high = Math.max(high, seq);
  }
  return { afterSeq: low - 1, untilSeq: high, subjectIds };
}

/**
 * The change frame of rows of a product event, with no entity data, in two tiers by weight: up to
 * `maxStreamChangeRows` each row with its seq, its writer and the stx of its write; past that their ids up to
 * `maxStreamChangeIds` and their range, and past those the range alone.
 * @param event - The event the rows belong to.
 * @param rows - The rows to name: those of the event its receivers may read, a create's or update's each with its seq.
 * @returns What every receiver of these rows gets.
 */
export function buildStreamChange(event: AppStreamProductEvent, rows: ActivityRow[] = event.rows): StreamChange {
  const { entityType } = event;

  // Home channel id for fetch prioritizing and unseen grouping; the org sequence does not key on it.
  const channelId = hierarchy.resolveDeepestAncestorId(entityType, asRecord(event));

  const named = rows.flatMap(({ rowData, seq, stx, userId }) =>
    typeof rowData.id === 'string' ? [{ rowData, entry: { subjectId: rowData.id, seq: seq ?? null, stx, actorId: userId } }] : [],
  );
  const entries = named.map(({ entry }) => entry);
  const overflowed = entries.length > maxStreamChangeRows;

  let propagation: StreamChange['propagation'] = null;
  const embedded = appConfig.productEmbeddings.some(({ embeddedProduct }) => embeddedProduct === entityType);
  if (embedded && !overflowed) {
    // Every row the frame names is in the hint: a host learns of an embedded change by it, or past the cap by its lists'
    // refetch. A soft delete arrives as an update, and the host drops its copy of that row.
    const update: string[] = [];
    const remove: string[] = [];
    for (const { rowData, entry } of named) {
      if (event.action === 'delete' || rowData.deletedAt != null) remove.push(entry.subjectId);
      else update.push(entry.subjectId);
    }
    propagation = { embeddedProduct: entityType, update, remove };
  }

  return {
    action: event.action,
    productType: entityType,
    organizationId: event.organizationId,
    tenantId: event.tenantId,
    channelId,
    rows: overflowed ? [] : entries,
    overflow: overflowed ? overflowOf(event.action, entries) : null,
    spreadWindow: computeSpreadWindow(event.organizationId),
    propagation,
  };
}

/**
 * Sent only to subscribers who could read rows where they were but not where they are: no range fetch returns those
 * rows for them, so this change is itself the removal instruction, in the tiers of `buildStreamChange`.
 * @param event - The update the rows moved in.
 * @param rows - The moved rows its receivers lost, each with `movedFrom`, its permission fields where it was.
 * @returns One frame of the rows, under their old home channel (unseen grouping) when they share one, else under none.
 */
export function buildMoveOut(event: AppStreamProductEvent, rows: ActivityRow[]): StreamChange {
  const base = buildStreamChange(event, rows);
  const homes = new Set(
    rows.map(({ movedFrom }) => {
      const oldPath = movedFrom ? hierarchy.computeProductPath(event.entityType, movedFrom) : null;
      return oldPath ? pathHomeId(oldPath) : event.organizationId;
    }),
  );
  return {
    ...base,
    action: 'moveOut',
    channelId: homes.size === 1 ? [...homes][0] : null,
    // The removal is the payload: no tab takes it for its own echo, and there is no range to fetch.
    rows: base.rows.map((entry) => ({ ...entry, stx: null, actorId: null })),
    overflow: base.overflow && { ...base.overflow, afterSeq: null, untilSeq: null },
    propagation: null,
  };
}
