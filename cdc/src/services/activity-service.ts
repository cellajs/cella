import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { isProductEntity } from 'shared';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import type { CdcRowData } from '../types';
import { wsClient } from '../network/websocket-client';
import { nanoid } from 'shared/utils/nanoid';
import { resolveChannelKey } from '../utils/compute-unified-deltas';
import { pickPermissionRowData } from '../utils/permission-row-data';

/** An individual entity cache-reservation token, sent with batch payloads. */
export interface CdcBatchReservation {
  token: string;
  entityType: string;
  entityId: string;
}

/** Per-row payload for batch messages: permission-relevant fields only (see pickPermissionRowData). */
export interface CdcBatchRow {
  seq?: number;
  rowData: CdcRowData;
}

/**
 * Outbound activity + row-data message the CDC worker sends to the API server.
 * This is the producing end of the wire contract; the backend independently validates
 * the same shape with `cdcMessageSchema` (see backend/src/lib/cdc-websocket.ts, `CdcMessage`).
 * Keep both in sync: a field added here needs a matching field there, or the backend
 * will reject the message at runtime.
 *
 * `batchRows` carries per-row permission fields (context ids, createdBy, publicAt) so
 * mixed-visibility batches dispatch per subscriber per row instead of deciding on the
 * first row alone.
 */
export interface CdcOutboundMessage {
  activity: InsertActivityModel & { id?: string; seq?: number; batchUntilSeq?: number };
  rowData: CdcRowData;
  batchRows?: CdcBatchRow[];
  cacheToken: string | null;
  batchReservations?: CdcBatchReservation[];
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
 * Generates cacheToken for product entities.
 */
function buildActivityPayload(
  baseActivity: InsertActivityModel & { id?: string },
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
): CdcOutboundMessage {
  const cacheToken = baseActivity.entityType && isProductEntity(baseActivity.entityType) ? nanoid() : null;

  // Context entity IDs are already populated on the activity by createActivity;
  // rowData is already compacted by the handlers (compactRowData).
  const activity = { ...baseActivity, seq };

  return { activity, rowData, cacheToken, _trace: traceContext };
}

/**
 * Send CDC message (activity + row data) to API server via WebSocket.
 * Generates cacheToken for product entities.
 */
export function sendMessageToApi(
  activity: InsertActivityModel,
  rowData: CdcRowData,
  traceContext: TraceContext,
  seq?: number,
): void {
  const payload = buildActivityPayload(activity, rowData, traceContext, seq);
  if (!wsClient.send(payload)) {
    log.warn('Failed to send message to API');
  }
}

/** Payload shape for a batch event (persist-only, no individual WS send). */
export interface BatchEventInfo {
  activity: InsertActivityModel & { id: string };
  rowData: CdcRowData;
  seq?: number;
}

/**
 * The seq-context key of a batch event, mirroring seq allocation: seqs are counters per
 * (channelKey, entityType) — see `computeBatchUnifiedDeltas`. Resource events (no
 * entityType) never carry seqs; grouping them by org matches their dispatch channel.
 */
function batchChannelKey({ activity, rowData }: BatchEventInfo): string {
  if (!activity.entityType) return activity.organizationId ?? 'none';
  return resolveChannelKey(activity.entityType, rowData, activity);
}

/**
 * Send batch CDC message(s) to the API server.
 *
 * Seqs are per-context counters, so one message can only describe one seq context: a
 * transaction batch spanning contexts (e.g. one bulk create with mixed placements) is
 * split into one message per seq context — the same channelKey seq allocation groups
 * by — each with its own contiguous seq..batchUntilSeq range, batch cacheToken and
 * reservations. Single-context batches send exactly one message, as before.
 */
export function sendBatchMessageToApi(
  events: BatchEventInfo[],
  traceContext: TraceContext,
): void {
  if (events.length === 0) return;

  const groups = new Map<string, BatchEventInfo[]>();
  for (const event of events) {
    const key = batchChannelKey(event);
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }

  for (const group of groups.values()) {
    sendBatchGroupToApi(group, traceContext);
  }
}

/** Send one per-context batch group as a single message, using the first event as representative. */
function sendBatchGroupToApi(
  events: BatchEventInfo[],
  traceContext: TraceContext,
): void {
  const first = events[0];

  // Collect seqs for min/max range (create/update batches)
  const seqs = events.map((e) => e.seq).filter((s): s is number => s !== undefined);
  const batchUntilSeq = seqs.length > 0 ? Math.max(...seqs) : undefined;
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : undefined;

  // Within one seq context the range is contiguous by construction (ranges are reserved
  // per context, and the per-context split above matches that grouping) — if this fires,
  // seq allocation itself is broken.
  if (minSeq !== undefined && batchUntilSeq !== undefined && batchUntilSeq - minSeq + 1 !== seqs.length) {
    log.error('Non-contiguous seqs within one seq context — sync integrity at risk', {
      minSeq, batchUntilSeq, seqCount: seqs.length, expected: batchUntilSeq - minSeq + 1,
    });
  }

  const batchToken = first.activity.entityType && isProductEntity(first.activity.entityType) ? nanoid() : null;

  const batchReservations: CdcBatchReservation[] | undefined = batchToken
    ? events
        .filter((e) => e.activity.entityType && e.activity.subjectId)
        .map((e) => ({
          token: nanoid(),
          entityType: e.activity.entityType!,
          entityId: e.activity.subjectId!,
        }))
    : undefined;

  const base = buildActivityPayload(first.activity, first.rowData, traceContext, minSeq);
  const activity = { ...base.activity, batchUntilSeq };

  // Per-row permission fields: dispatch decides per subscriber across ALL rows of the
  // batch (the representative first row alone would mis-dispatch mixed-visibility batches)
  const batchRows: CdcBatchRow[] = events.map((event) => ({
    seq: event.seq,
    rowData: pickPermissionRowData(event.rowData) as CdcRowData,
  }));

  const payload: CdcOutboundMessage = { ...base, activity, batchRows, cacheToken: batchToken, batchReservations };

  if (!wsClient.send(payload)) {
    log.warn('Failed to send batch message to API', { batchSize: events.length });
  }
}
