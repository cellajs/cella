import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { isProductEntity } from 'shared';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import type { CdcRowData } from '../types';
import { wsClient } from '../network/websocket-client';
import { nanoid } from 'shared/nanoid';

/** An individual entity cache-reservation token, sent with batch payloads. */
export interface CdcBatchReservation {
  token: string;
  entityType: string;
  entityId: string;
}

/**
 * Outbound activity + row-data message the CDC worker sends to the API server.
 * This is the producing end of the wire contract; the backend independently validates
 * the same shape with `cdcMessageSchema` (see backend/src/lib/cdc-websocket.ts, `CdcMessage`).
 * Keep both in sync: a field added here needs a matching field there, or the backend
 * will reject the message at runtime.
 */
export interface CdcOutboundMessage {
  activity: InsertActivityModel & { id?: string; seq?: number; batchUntilSeq?: number };
  rowData: CdcRowData;
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
 * Send a single batch CDC message to the API server.
 * Uses the first event's activity as the representative, enriched with batch fields.
 */
export function sendBatchMessageToApi(
  events: BatchEventInfo[],
  traceContext: TraceContext,
): void {
  if (events.length === 0) return;

  const first = events[0];

  // Collect seqs for min/max range (create/update batches)
  const seqs = events.map((e) => e.seq).filter((s): s is number => s !== undefined);
  const batchUntilSeq = seqs.length > 0 ? Math.max(...seqs) : undefined;
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : undefined;

  if (minSeq !== undefined && batchUntilSeq !== undefined && batchUntilSeq - minSeq + 1 !== seqs.length) {
    log.error('Non-contiguous seqs in batch — sync integrity at risk', {
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

  const payload: CdcOutboundMessage = { ...base, activity, cacheToken: batchToken, batchReservations };

  if (!wsClient.send(payload)) {
    log.warn('Failed to send batch message to API', { batchSize: events.length });
  }
}




