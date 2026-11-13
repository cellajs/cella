import { hierarchy, type ProductEntityType } from 'shared';
import type { PermissionRowData } from 'shared/permissions/permission-row-data';
import type { TraceContext } from 'shared/tracing';
import type { OwnActivityColumns } from '#/lib/activity-bus';
import type { CdcMessageInput } from '#/lib/cdc-websocket';
import { wsClient } from '../network/websocket-client';
import type { CdcActivity } from '../pipeline/parse-message';
import type { CdcRowData, PendingEvent } from '../types';
import { resolveChannelKey } from '../utils/compute-unified-deltas';
import { pickPermissionRowData } from '../utils/permission-row-data';

type ProductMessageInput = Extract<CdcMessageInput, { rows: unknown }>;

/** An activity with the id its flush gave it. */
type RecordedActivity = CdcActivity & { id: string };

/** The columns a product row carries of its own activity, typed as the worker records them for the wire check. */
type RowActivityColumns = 'actorId' | 'changedFields' | 'stx';

/**
 * One product row of a message: the activity it was recorded as (its id, writer, changed fields and stx), the fields
 * that decide who may read it (see `pickPermissionRowData`), the sequence value the row holds, and for a row whose path
 * changed the same fields of the row before the move, so that dispatch can tell those who lost access.
 */
type CdcMessageRow = Omit<ProductMessageInput['rows'][number], RowActivityColumns> & Pick<CdcActivity, RowActivityColumns>;

/**
 * The message of one row that is no product (a membership, a tenant, a channel): its listeners act on the whole row.
 * `signalVersions` holds per signal type the version this change moved it to, empty when it moved none (a channel
 * delete its root's covers); a change delivered again carries none.
 */
type CdcRowMessage = Omit<Exclude<CdcMessageInput, { rows: unknown }>, 'activity'> & { activity: RecordedActivity };

/**
 * The message of the product rows of one audience, one or more: what they share (type, action, table and place) as
 * `activity`, and each row with its own activity. The API derives the change frames from the rows.
 */
type CdcProductMessage = Omit<ProductMessageInput, 'activity' | 'rows'> & {
  activity: Omit<CdcActivity, OwnActivityColumns | 'organizationId' | 'tenantId'> & {
    entityType: ProductEntityType;
    organizationId: string;
    tenantId: string;
  };
  rows: CdcMessageRow[];
};

/**
 * What the worker sends the API for a change: the envelope as `cdcMessageSchema` takes it, the activity as the worker
 * records it.
 * @see backend/src/lib/cdc-websocket.ts
 */
export type CdcOutboundMessage = CdcRowMessage | CdcProductMessage;

/** Both halves of an LSN zero-padded to eight digits and dash-joined. */
function padLsn(lsn: string): string {
  const [hi, lo] = lsn.split('/');
  return `${hi.padStart(8, '0')}-${lo.padStart(8, '0')}`;
}

/**
 * Activity id of a change: the commit position of its transaction and its index in that transaction. Both are the
 * same on every delivery, which makes replay idempotent, no two changes share them, and padding keeps ids in commit
 * order under lexical comparison.
 * @returns Zero-padded, dash-joined commit LSN and index.
 */
export function generateActivityId({ commitLsn, index }: Pick<PendingEvent, 'commitLsn' | 'index'>): string {
  return `${padLsn(commitLsn)}-${String(index).padStart(8, '0')}`;
}

/**
 * Sends the message of one row that is no product, with the whole row. A send that fails throws: the caller's flush
 * fails with it, and the change is delivered again.
 */
export function sendMessageToApi(
  activity: RecordedActivity,
  rowData: CdcRowData,
  traceContext: TraceContext,
  movedFrom?: PermissionRowData | null,
  signalVersions?: Record<string, number>,
): void {
  const message: CdcRowMessage = { activity, rowData, _trace: traceContext };
  if (movedFrom) message.movedFrom = movedFrom;
  if (signalVersions) message.signalVersions = signalVersions;
  wsClient.send(message);
}

/** One product row of a flush as its message is built from it: its activity, its row and the sequence value the row holds. */
export interface ProductRow {
  activity: RecordedActivity;
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: PermissionRowData | null;
}

/** The message of one audience: what its rows share, and each row with its own activity and permission fields. */
function buildProductMessage(productType: ProductEntityType, rows: ProductRow[], traceContext: TraceContext): CdcProductMessage {
  const { id, actorId, subjectId, changedFields, stx, createdAt, organizationId, tenantId, ...shared } = rows[0].activity;
  // Product tables hold both NOT NULL, and a row without its organization already failed the flush's count deltas.
  if (!organizationId || !tenantId) throw new Error(`A ${productType} activity without its tenant or organization`);
  return {
    activity: { ...shared, entityType: productType, organizationId, tenantId },
    rows: rows.map(({ activity, rowData, seq, movedFrom }) => ({
      activityId: activity.id,
      actorId: activity.actorId,
      changedFields: activity.changedFields,
      stx: activity.stx,
      rowData: pickPermissionRowData(rowData),
      seq,
      ...(movedFrom ? { movedFrom } : {}),
    })),
    _trace: traceContext,
  };
}

/**
 * Sends the product rows of one type, one message per audience: the rows under one path, which the same clients may
 * read. Sequence values come from one order per organization, so those of one audience need not be contiguous: each
 * row carries its own. A send that fails throws, like `sendMessageToApi`.
 */
export function sendProductMessagesToApi(productType: ProductEntityType, rows: ProductRow[], traceContext: TraceContext): void {
  const audiences = Map.groupBy(
    rows,
    (row) => hierarchy.computeProductPath(productType, row.rowData) ?? resolveChannelKey(productType, row.rowData, row.activity),
  );
  for (const audience of audiences.values()) wsClient.send(buildProductMessage(productType, audience, traceContext));
}
