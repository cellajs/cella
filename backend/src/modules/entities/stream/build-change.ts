import { appConfig, hierarchy, pathHomeId } from 'shared';
import { asRecord } from 'shared/utils/as-record';
import type { ActivityRow } from '#/lib/activity-bus';
import { maxStreamChangeIds, maxStreamChangeRows } from '#/modules/entities/stream/helpers';
import { computeSpreadWindow } from '#/modules/entities/stream/subscriber-manager';
import type { StreamProductEvent } from '#/modules/entities/stream/types';
import type { StreamChange } from '#/schemas';

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
 * @param rows - The rows to name: those of the event its receivers may read, a create's, update's or soft delete's each with its seq.
 * @returns What every receiver of these rows gets.
 */
export function buildStreamChange(event: StreamProductEvent, rows: ActivityRow[] = event.rows): StreamChange {
  const { entityType } = event;

  // Home channel id for fetch prioritizing and unseen grouping; the org sequence does not key on it.
  const channelId = hierarchy.resolveDeepestAncestorId(entityType, asRecord(event));

  const named = rows.map(({ rowData, seq, stx, actorId }) => ({ rowData, entry: { subjectId: rowData.id, seq: seq ?? null, stx, actorId } }));
  const entries = named.map(({ entry }) => entry);
  const overflowed = entries.length > maxStreamChangeRows;

  let propagation: StreamChange['propagation'] = null;
  const embedded = appConfig.productEmbeddings.some(({ embeddedProductType }) => embeddedProductType === entityType);
  if (embedded && !overflowed) {
    // Every row the frame names is in the hint: a host learns of an embedded change by it, or past the cap by its lists'
    // refetch.
    const ids = entries.map(({ subjectId }) => subjectId);
    const [update, remove] = event.action === 'delete' ? [[], ids] : [ids, []];
    propagation = { embeddedProductType: entityType, update, remove };
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
export function buildMoveOut(event: StreamProductEvent, rows: ActivityRow[]): StreamChange {
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
