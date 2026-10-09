import { hierarchy, type ProductEntityType } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { TraceContext } from '../lib/tracing';
import { wsClient } from '../network/websocket-client';
import type { CdcRowData, PendingEvent } from '../types';
import { resolveChannelKey } from '../utils/compute-unified-deltas';
import { pickPermissionRowData } from '../utils/permission-row-data';

/**
 * One product row of a message: the fields that decide who may read it (see `pickPermissionRowData`), the sequence value
 * the row holds, and for a row whose path changed the same fields of the row before the move, so that dispatch can tell
 * those who lost access.
 */
interface CdcMessageRow {
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: CdcRowData | null;
}

/** What every message carries: the activity of its row, or of its first row, and the trace it belongs to. */
interface CdcMessageBase {
  activity: InsertActivityModel & { id?: string };
  _trace: TraceContext;
}

/** The message of one row that is no product (a membership, a tenant, a channel): its listeners act on the whole row. */
interface CdcRowMessage extends CdcMessageBase {
  rowData: CdcRowData;
  movedFrom?: CdcRowData | null;
}

/**
 * The message of the product rows of one audience, one or more. The API derives the notification from the list: one row
 * gives its `seq` and the activity's `stx`, more rows give the range of their sequence values and their number.
 */
interface CdcProductMessage extends CdcMessageBase {
  rows: CdcMessageRow[];
}

/**
 * What the worker sends the API for a change, mirrored by `cdcMessageSchema`.
 * @see backend/src/lib/cdc-websocket.ts
 */
export type CdcOutboundMessage = CdcRowMessage | CdcProductMessage;

const padLsn = (lsn: string): string | null => {
  const [hi, lo] = lsn.split('/');
  return lo === undefined ? null : `${hi.padStart(8, '0')}-${lo.padStart(8, '0')}`;
};

/**
 * Activity id of a change: the commit position of its transaction and its index in that transaction. Both are the
 * same on every delivery, which makes replay idempotent, no two changes share them, and padding keeps ids in commit
 * order under lexical comparison. An event outside a transaction takes its own position.
 * @param event - The change: its LSN, and its transaction's commit LSN and its index there when it has one.
 * @returns Zero-padded, dash-joined commit LSN and index.
 */
export function generateActivityId({ lsn, commitLsn, index = 0 }: Pick<PendingEvent, 'lsn' | 'commitLsn' | 'index'>): string {
  const position = padLsn(commitLsn ?? lsn);
  if (position === null) return lsn; // Not in LSN format.
  return `${position}-${String(index).padStart(8, '0')}`;
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

/** The message of one audience: the first row's activity speaks for all, and each row carries its own permission fields. */
function buildProductMessage(rows: ProductRow[], traceContext: TraceContext): CdcProductMessage {
  return {
    activity: rows[0].activity,
    rows: rows.map(({ rowData, seq, movedFrom }) => ({ rowData: pickPermissionRowData(rowData), seq, ...(movedFrom ? { movedFrom } : {}) })),
    _trace: traceContext,
  };
}

/**
 * Sends the product rows of one type, one message per audience: the rows under one path, which the same clients may
 * read. Sequence values come from one order per organization, so those of one audience need not be contiguous: each
 * row carries its own. A send that fails throws, like `sendMessageToApi`.
 */
export function sendProductMessagesToApi(productType: ProductEntityType, rows: ProductRow[], traceContext: TraceContext): void {
  const audiences = new Map<string, ProductRow[]>();
  for (const row of rows) {
    const key = hierarchy.computeProductPath(productType, row.rowData) ?? resolveChannelKey(productType, row.rowData, row.activity);
    const audience = audiences.get(key);
    if (audience) audience.push(row);
    else audiences.set(key, [row]);
  }

  for (const audience of audiences.values()) wsClient.send(buildProductMessage(audience, traceContext));
}
