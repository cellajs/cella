import type { StxBase } from 'sdk/types.gen';
import { hierarchy, type ProductEntityType } from 'shared';
import type { TraceContext } from 'shared/tracing';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { wsClient } from '../network/websocket-client';
import type { CdcRowData, PendingEvent } from '../types';
import { resolveChannelKey } from '../utils/compute-unified-deltas';
import { pickPermissionRowData } from '../utils/permission-row-data';

/** The activity columns that differ between the rows of one message, which holds several transactions and writers. */
type OwnActivityColumns = 'id' | 'userId' | 'subjectId' | 'changedFields' | 'stx' | 'createdAt';

/**
 * One product row of a message: the activity it was recorded as (its id, writer, changed fields and stx), the fields
 * that decide who may read it (see `pickPermissionRowData`), the sequence value the row holds, and for a row whose path
 * changed the same fields of the row before the move, so that dispatch can tell those who lost access.
 */
interface CdcMessageRow {
  activityId: string;
  userId: string | null;
  changedFields: string[] | null;
  stx: StxBase | null;
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: CdcRowData | null;
}

/** The message of one row that is no product (a membership, a tenant, a channel): its listeners act on the whole row. */
interface CdcRowMessage {
  activity: InsertActivityModel & { id?: string };
  rowData: CdcRowData;
  movedFrom?: CdcRowData | null;
  _trace: TraceContext;
}

/**
 * The message of the product rows of one audience, one or more: what they share (type, action, table and place) as
 * `activity`, and each row with its own activity. The API derives the change frames from the rows.
 */
interface CdcProductMessage {
  activity: Omit<InsertActivityModel, OwnActivityColumns> & { entityType: ProductEntityType };
  rows: CdcMessageRow[];
  _trace: TraceContext;
}

/**
 * What the worker sends the API for a change, mirrored by `cdcMessageSchema`.
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
  activity: InsertActivityModel,
  rowData: CdcRowData,
  traceContext: TraceContext,
  movedFrom?: CdcRowData | null,
): void {
  const message: CdcRowMessage = { activity, rowData, _trace: traceContext };
  if (movedFrom) message.movedFrom = movedFrom;
  wsClient.send(message);
}

/** One product row of a flush as its message is built from it: its activity, its row and the sequence value the row holds. */
export interface ProductRow {
  activity: InsertActivityModel & { id: string };
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: CdcRowData | null;
}

/** The message of one audience: what its rows share, and each row with its own activity and permission fields. */
function buildProductMessage(productType: ProductEntityType, rows: ProductRow[], traceContext: TraceContext): CdcProductMessage {
  const { id, userId, subjectId, changedFields, stx, createdAt, ...shared } = rows[0].activity;
  return {
    activity: { ...shared, entityType: productType },
    rows: rows.map(({ activity, rowData, seq, movedFrom }) => ({
      activityId: activity.id,
      userId: activity.userId ?? null,
      changedFields: activity.changedFields ?? null,
      stx: activity.stx ?? null,
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
