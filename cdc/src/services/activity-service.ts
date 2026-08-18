import { hierarchy, isProduct } from 'shared';
import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import { wsClient } from '../network/websocket-client';
import type { CdcRowData } from '../types';
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

/**
 * Fixed-width activity id: padding preserves commit order under lexical cursor comparisons and makes
 * replay idempotent.
 * @param lsn PostgreSQL WAL position.
 * @returns Zero-padded, dash-joined LSN.
 */
export function generateActivityId(lsn: string): string {
  const [hi, lo] = lsn.split('/');
  if (lo === undefined) return lsn; // Not in LSN format.
  return `${hi.padStart(8, '0')}-${lo.padStart(8, '0')}`;
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

export function sendMessageToApi(
  activity: InsertActivityModel,
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
  movedFrom?: CdcRowData | null,
): void {
  const payload = buildActivityPayload(activity, rowData, traceContext, seq);
  if (movedFrom) payload.movedFrom = movedFrom;
  if (!wsClient.send(payload)) {
    log.warn('Failed to send message to API');
  }
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
 */
export function sendBatchMessageToApi(events: BatchEvent[], traceContext: TraceContext): void {
  if (events.length === 0) return;

  const groups = new Map<string, BatchEvent[]>();
  for (const event of events) {
    const key = batchPathKey(event);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  for (const group of groups.values()) {
    sendBatchGroupToApi(group, traceContext);
  }
}

/** Send one per-path batch group as a single message, using the first event as representative. */
function sendBatchGroupToApi(events: BatchEvent[], traceContext: TraceContext): void {
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

  if (!wsClient.send(payload)) {
    log.warn('Failed to send batch message to API', { batchSize: events.length });
  }
}
