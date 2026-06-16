import type { InsertActivityModel } from '#/modules/activities/activities-db';
import { appConfig, hierarchy, isProductEntity } from 'shared';
import { logEvent } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import type { CdcRowData } from '../types';
import { excludedRowDataKeys } from '../utils/compact-row-data';
import { wsClient } from '../network/websocket-client';
import { nanoid } from 'shared/nanoid';

/** Strip large columns from row data before WS transmission. */
function stripExcludedColumns(rowData: CdcRowData): CdcRowData {
  if (excludedRowDataKeys.size === 0) return rowData;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (!excludedRowDataKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
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
  if (lo === undefined) return lsn; // not in LSN format — return unchanged
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
) {
  // Generate cache token for product entities
  const cacheToken = baseActivity.entityType && isProductEntity(baseActivity.entityType) ? nanoid() : null;

  // Derive context entity IDs from hierarchy (mirrors createActivity logic)
  const subjectType = baseActivity.entityType ?? baseActivity.resourceType;
  const contextIds: Record<string, string | null> = {};
  if (subjectType) {
    for (const ancestor of hierarchy.getOrderedAncestors(subjectType)) {
      const key = appConfig.entityIdColumnKeys[ancestor];
      const value = (baseActivity as Record<string, unknown>)[key];
      contextIds[key] = typeof value === 'string' ? value : null;
    }
  }

  const activity = { ...baseActivity, ...contextIds, seq }

  return { activity, rowData: stripExcludedColumns(rowData), cacheToken,  _trace: traceContext };
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
    logEvent('warn', 'Failed to send message to API');
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
  const isDelete = first.activity.action === 'delete';

  // Collect seqs for min/max range (create/update batches)
  const seqs = events.map((e) => e.seq).filter((s): s is number => s !== undefined);
  const batchUntilSeq = seqs.length > 0 ? Math.max(...seqs) : undefined;
  const minSeq = seqs.length > 0 ? Math.min(...seqs) : undefined;

  // Invariant: seqs must be contiguous within a batch — gap detection and unseen counts depend on this.
  if (minSeq !== undefined && batchUntilSeq !== undefined && batchUntilSeq - minSeq + 1 !== seqs.length) {
    logEvent('error', 'Non-contiguous seqs in batch — sync integrity at risk', {
      minSeq, batchUntilSeq, seqCount: seqs.length, expected: batchUntilSeq - minSeq + 1,
    });
  }

  // Collect deleted IDs
  const deletedIds = isDelete ? events.map((e) => e.activity.subjectId).filter(Boolean) as string[] : undefined;

  // Generate batch cache token for product entities
  const batchToken = first.activity.entityType && isProductEntity(first.activity.entityType) ? nanoid() : null;

  // Build individual cache reservations for each entity
  const batchReservations = batchToken
    ? events
        .filter((e) => e.activity.entityType && e.activity.subjectId)
        .map((e) => ({
          token: nanoid(),
          entityType: e.activity.entityType!,
          entityId: e.activity.subjectId!,
        }))
    : undefined;

  // Build payload using the first event as representative, enriched with batch fields
  const base = buildActivityPayload(first.activity, first.rowData, traceContext, minSeq);
  const activity = { ...base.activity, batchUntilSeq, deletedIds };

  const payload = {  ...base, activity, cacheToken: batchToken, batchReservations };

  if (!wsClient.send(payload)) {
    logEvent('warn', 'Failed to send batch message to API', { batchSize: events.length });
  }
}




