import { appConfig, hierarchy, pathHomeId } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { dbPoolPressure } from '#/db/db';
import type { ActivityRow } from '#/lib/activity-bus';
import { maxStreamChangeRows } from '#/modules/entities/stream/helpers';
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

/** The sequence range a frame over the row cap names: that of a create's or update's rows, none of a delete's. */
function overflowRange(action: StreamChange['action'], entries: StreamChange['rows']): NonNullable<StreamChange['overflow']> {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  for (const { seq } of entries) {
    if (seq === null) continue;
    low = Math.min(low, seq);
    high = Math.max(high, seq);
  }
  if (action === 'delete' || high < low) return { afterSeq: null, untilSeq: null };
  return { afterSeq: low - 1, untilSeq: high };
}

/**
 * The change frame of rows of a product event, with no entity data: each row with its seq, its writer and the stx of
 * its write, or past `maxStreamChangeRows` none of them and their range.
 * @param event - The event the rows belong to.
 * @param rows - The rows to name: those of the event its receivers may read.
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
  const embedding = appConfig.productEmbeddings.find(({ embeddedProduct }) => embeddedProduct === entityType);
  if (embedding && !overflowed) {
    // Every row the frame names is in the hint: a host learns of an embedded change by it, or past the cap by its lists'
    // refetch. A soft delete arrives as an update, and the host drops its copy of that row.
    const update: string[] = [];
    const remove: string[] = [];
    for (const { rowData, entry } of named) {
      if (event.action === 'delete' || rowData.deletedAt != null) remove.push(entry.subjectId);
      else update.push(entry.subjectId);
    }
    propagation = {
      embeddedProduct: embedding.embeddedProduct,
      hostProduct: embedding.hostProduct,
      hostColumn: embedding.hostColumn,
      update,
      remove,
    };
  }

  return {
    action: event.action,
    productType: entityType,
    organizationId: event.organizationId,
    tenantId: event.tenantId ?? null,
    channelId,
    rows: overflowed ? [] : entries,
    overflow: overflowed ? overflowRange(event.action, entries) : null,
    spreadWindow: computeSpreadWindow(event.organizationId),
    propagation,
  };
}

/**
 * Sent only to subscribers who could read a row where it was but not where it is: no range fetch returns the row for
 * them, so this change is itself the removal instruction.
 * @param event - The update as it reads where the row was.
 * @param row - The moved row.
 * @param movedFrom - Its permission fields where it was.
 */
export function buildMoveOut(event: AppStreamProductEvent, row: ActivityRow, movedFrom: Record<string, unknown>): StreamChange {
  const base = buildStreamChange(event, [row]);
  const oldPath = hierarchy.computeProductPath(event.entityType, movedFrom);
  return {
    ...base,
    action: 'moveOut',
    // The old path's deepest segment is the old home channel (unseen grouping).
    channelId: oldPath ? pathHomeId(oldPath) : base.channelId,
    // The removal is the payload: no tab takes it for its own echo.
    rows: base.rows.map((entry) => ({ ...entry, stx: null, actorId: null })),
    propagation: null,
  };
}
