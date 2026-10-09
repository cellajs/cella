import { hierarchy, isProduct } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import type { TraceContext } from '../lib/tracing';
import { wsClient } from '../network/websocket-client';
import type { CdcRowData, PendingEvent } from '../types';
import { resolveChannelKey } from '../utils/compute-unified-deltas';
import { pickPermissionRowData } from '../utils/permission-row-data';

/** Per-row payload for batch messages: permission-relevant fields only (see pickPermissionRowData). */
export interface CdcBatchRow {
  seq?: number;
  rowData: CdcRowData;
  /** Old-row permission subset when this row's path changed (move-out), else absent. */
  movedFrom?: CdcRowData | null;
}

/**
 * CDC-to-backend wire payload mirrored by `cdcMessageSchema`. Batch rows carry their own permission
 * data and seq because group ranges need not be contiguous and visibility may differ. `movedFrom`
 * carries the prior permission projection so dispatch can notify subscribers that lost access.
 * @see backend/src/lib/cdc-websocket.ts
 */
export interface CdcOutboundMessage {
  activity: InsertActivityModel & { id?: string; seq?: number; batchUntilSeq?: number; count?: number };
  rowData: CdcRowData;
  movedFrom?: CdcRowData | null;
  batchRows?: CdcBatchRow[];
  _trace: TraceContext;
}

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

function buildActivityPayload(
  baseActivity: InsertActivityModel & { id?: string },
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
): CdcOutboundMessage {
  // createActivity already populated the channel entity ids; handlers already compacted rowData.
  const activity = { ...baseActivity, seq };

  return { activity, rowData, _trace: traceContext };
}

/** @returns false when the API did not take the message: the caller fails its flush, and the event is delivered again. */
export function sendMessageToApi(
  activity: InsertActivityModel,
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
  movedFrom?: CdcRowData | null,
): boolean {
  const payload = buildActivityPayload(activity, rowData, traceContext, seq);
  if (movedFrom) payload.movedFrom = movedFrom;
  return wsClient.send(payload);
}

/** Payload shape for a batch event (persist-only, no individual WS send). */
export interface BatchEvent {
  activity: InsertActivityModel & { id: string };
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: CdcRowData | null;
}

/** One path-and-type group lets clients route by prefix; resources group by organization. */
function batchPathKey({ activity, rowData }: BatchEvent): string {
  if (activity.entityType && isProduct(activity.entityType)) {
    const path = hierarchy.computeProductPath(activity.entityType, rowData);
    return `${path ?? resolveChannelKey(activity.entityType, rowData, activity)}\0${activity.entityType}`;
  }
  return activity.organizationId ?? 'none';
}

/**
 * Splits into one message per (path, entityType) group so each describes a single audience. Seqs come
 * from the shared org sequence, so a group's `seq..batchUntilSeq` range may interleave with other
 * groups: `count` and the per-row seqs in `batchRows` are authoritative, range arithmetic is not.
 * A group of one row goes as a single-row message: its notification carries the row's `stx`, so the
 * tab that wrote it recognizes its own write and fetches nothing.
 */
export function sendBatchMessageToApi(events: BatchEvent[], traceContext: TraceContext): boolean {
  if (events.length === 0) return true;

  const groups = new Map<string, BatchEvent[]>();
  for (const event of events) {
    const key = batchPathKey(event);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  let sent = true;
  for (const group of groups.values()) {
    const [only] = group;
    const taken =
      group.length === 1
        ? sendMessageToApi(only.activity, only.rowData, traceContext, only.seq, only.movedFrom)
        : sendBatchGroupToApi(group, traceContext);
    if (!taken) sent = false;
  }
  return sent;
}

/** Send one per-path batch group as a single message, using the first event as representative. */
function sendBatchGroupToApi(events: BatchEvent[], traceContext: TraceContext): boolean {
  const first = events[0];

  // The min/max range brackets this group's rows but may contain other groups' values in between.
  const seqs = events.map((e) => e.seq).filter((s): s is number => s !== undefined);
  const batchUntilSeq = seqs.length > 0 ? Math.max(...seqs) : undefined;
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : undefined;

  const base = buildActivityPayload(first.activity, first.rowData, traceContext, minSeq);
  const activity = { ...base.activity, batchUntilSeq, count: events.length };

  // Per-row permission fields: the representative first row alone would mis-dispatch mixed-visibility batches.
  const batchRows: CdcBatchRow[] = events.map((event) => ({
    seq: event.seq,
    rowData: pickPermissionRowData(event.rowData) as CdcRowData,
    ...(event.movedFrom ? { movedFrom: event.movedFrom } : {}),
  }));

  // The backend invalidates each row's detail-cache entry from batchRows (see cdc-websocket handleMessage).
  const payload: CdcOutboundMessage = { ...base, activity, batchRows };

  return wsClient.send(payload);
}
