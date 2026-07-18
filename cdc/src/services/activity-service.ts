import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { isProductEntity } from 'shared';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import type { CdcRowData } from '../types';
import { wsClient } from '../network/websocket-client';
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
 * Outbound activity + row-data message the CDC worker sends to the API server.
 * This is the producing end of the wire contract; the backend independently validates
 * the same shape with `cdcMessageSchema`.
 * Keep both in sync: a field added here needs a matching field there, or the backend
 * will reject the message at runtime.
 *
 * `batchRows` carries per-row permission fields (context ids, path, createdBy, publicAt)
 * so mixed-visibility batches dispatch per subscriber per row. The first row alone cannot
 * represent visibility for the entire batch.
 *
 * Seq values are org-sequence values (shared across product entity types); a batch group's
 * `seq..batchUntilSeq` range is NOT guaranteed contiguous for its own rows: `count`
 * carries the actual row count, and per-row seqs ride `batchRows`.
 *
 * `movedFrom` (single) / `batchRows[].movedFrom` carry the OLD row's permission subset
 * when a row's materialized path changed, so dispatch can deliver a move-out to
 * subscribers who could read the old location but not the new one.
 *
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
 * Generate a deterministic activity ID from LSN for idempotency.
 * Same LSN will always produce the same ID, preventing duplicates on replay.
 *
 * A Postgres LSN is a 64-bit value printed as two unpadded 32-bit hex segments
 * (e.g. "0/16B3748"). We zero-pad each segment to 8 hex digits so the resulting id
 * is fixed-width (17 chars) and sorts lexicographically in true commit order. This
 * lets cursor scans use plain `id > cursor` string comparison without numeric parsing.
 *
 * @param lsn - Log Sequence Number from PostgreSQL WAL (e.g., "0/16B3748")
 * @returns Zero-padded, dash-joined LSN (e.g., "00000000-016B3748")
 */
export function generateActivityId(lsn: string): string {
  const [hi, lo] = lsn.split('/');
  if (lo === undefined) return lsn; // not in LSN format, return unchanged
  return `${hi.padStart(8, '0')}-${lo.padStart(8, '0')}`;
}

/**
 * Build activity payload for WebSocket transmission.
 */
function buildActivityPayload(
  baseActivity: InsertActivityModel & { id?: string },
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
): CdcOutboundMessage {
  // Channel entity IDs are already populated on the activity by createActivity;
  // rowData is already compacted by the handlers (compactRowData).
  const activity = { ...baseActivity, seq };

  return { activity, rowData, _trace: traceContext };
}

/**
 * Send CDC message (activity + row data) to API server via WebSocket.
 */
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
export interface BatchEventInfo {
  activity: InsertActivityModel & { id: string };
  rowData: CdcRowData;
  seq?: number;
  movedFrom?: CdcRowData | null;
}

/**
 * The audience-grouping key of a batch event: the row's materialized path when present
 * (product rows), else the deepest-ancestor channel key, else the org. One message per
 * (path, entityType) group keeps notifications one-audience and lets the client route
 * by path prefix. Resource events (no entityType) and non-product entities group by org.
 */
function batchPathKey({ activity, rowData }: BatchEventInfo): string {
  if (activity.entityType && isProductEntity(activity.entityType)) {
    const path = typeof rowData.path === 'string' && rowData.path ? rowData.path : null;
    return `${path ?? resolveChannelKey(activity.entityType, rowData, activity)}\0${activity.entityType}`;
  }
  return activity.organizationId ?? 'none';
}

/**
 * Send batch CDC message(s) to the API server.
 *
 * Messages are split per (path, entityType) group so each describes one audience and one
 * entity type. Seq values come from the shared org sequence: a group's `seq..batchUntilSeq`
 * range may interleave with other groups' values, so `count` (and per-row seqs in
 * `batchRows`) carry the exact contents: range arithmetic is not row count.
 */
export function sendBatchMessageToApi(
  events: BatchEventInfo[],
  traceContext: TraceContext,
): void {
  if (events.length === 0) return;

  const groups = new Map<string, BatchEventInfo[]>();
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
function sendBatchGroupToApi(
  events: BatchEventInfo[],
  traceContext: TraceContext,
): void {
  const first = events[0];

  // Collect seqs for min/max range (create/update batches). Under the org sequence the
  // range brackets this group's rows but may contain other groups' values in between;
  // `count` is authoritative for size.
  const seqs = events.map((e) => e.seq).filter((s): s is number => s !== undefined);
  const batchUntilSeq = seqs.length > 0 ? Math.max(...seqs) : undefined;
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : undefined;

  const base = buildActivityPayload(first.activity, first.rowData, traceContext, minSeq);
  const activity = { ...base.activity, batchUntilSeq, count: events.length };

  // Per-row permission fields: dispatch decides per subscriber across ALL rows of the
  // batch (the representative first row alone would mis-dispatch mixed-visibility batches)
  const batchRows: CdcBatchRow[] = events.map((event) => ({
    seq: event.seq,
    rowData: pickPermissionRowData(event.rowData) as CdcRowData,
    ...(event.movedFrom ? { movedFrom: event.movedFrom } : {}),
  }));

  // The backend invalidates each row's detail-cache entry from batchRows, so a later detail
  // fetch re-enriches (see cdc-websocket handleMessage).
  const payload: CdcOutboundMessage = { ...base, activity, batchRows };

  if (!wsClient.send(payload)) {
    log.warn('Failed to send batch message to API', { batchSize: events.length });
  }
}
