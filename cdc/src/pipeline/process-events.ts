import { isProduct } from 'shared';
import { activitiesTable } from '#/modules/activities/activities-db';

import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';

import { type BatchEvent, generateActivityId, sendBatchMessageToApi, sendMessageToApi } from '../services/activity-service';
import { metrics } from '../services/cdc-metrics';
import { circuitBreaker } from '../services/circuit-breaker';
import { withRetry } from '../services/retry';
import { replicationState } from '../services/replication-state';
import { activityAttrs, cdcAttrs, cdcSpanNames, withSpan } from '../lib/tracing';
import type { TraceContext } from '../lib/tracing';
import { applyBatchUnifiedDeltas } from '../utils/apply-unified-deltas';
import { syncChannelPaths } from '../utils/channel-path-sync';
import { computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import { cleanupEmbeddingReferences } from '../utils/embedding-cleanup';

import type { CdcRowData } from '../types';
import type { ParseMessageResult } from './parse-message';

/** An event prepared for persistence + dispatch: activity with a generated id, its row data, and seq. */
interface PreparedEvent {
  activityWithId: BatchEvent['activity'];
  seq: number | undefined;
  lsn: string;
  rowData: CdcRowData;
  movedFrom: CdcRowData | null;
}

// Activity persistence

/**
 * Prepare an activity for persistence: generate ID, extract seq.
 */
function prepareActivity(
  parseResult: ParseMessageResult,
  lsn: string,
): { activityWithId: BatchEvent['activity']; seq: number | undefined } {
  const activityId = generateActivityId(lsn);
  const activityWithId = { ...parseResult.activity, id: activityId };
  const seq = typeof parseResult.rowData.seq === 'number' ? parseResult.rowData.seq : undefined;
  return { activityWithId, seq };
}

/**
 * Persist activities to DB in a single multi-row insert with retry.
 * Falls back to individual inserts if the batch insert fails.
 * Returns false if persistence failed (caller should skip deltas).
 */
async function persistActivities(
  infos: Array<{ activityWithId: BatchEvent['activity']; lsn: string }>,
  tableName: string,
): Promise<boolean> {
  if (infos.length === 1) {
    const { activityWithId, lsn } = infos[0];
    const insertResult = await withRetry(async () => {
      await cdcDb.insert(activitiesTable).values(activityWithId).onConflictDoNothing();
    }, 'insert activity');

    if (!insertResult.success) {
      log.error('Activity insert failed permanently — event skipped', {
        activityId: activityWithId.id,
        lsn,
        tableName,
        action: activityWithId.action,
        subjectId: activityWithId.subjectId,
        err: insertResult.error });
      circuitBreaker.recordFailure(tableName);
      return false;
    }

    if (insertResult.attempts > 1) {
      log.info(`Activity insert succeeded after retry`, {
        activityId: activityWithId.id,
        attempts: insertResult.attempts,
        lsn });
    }
    return true;
  }

  // Multi-row batch insert
  const insertResult = await withRetry(async () => {
    await cdcDb.insert(activitiesTable).values(infos.map((i) => i.activityWithId)).onConflictDoNothing();
  }, 'batch insert activities');

  if (!insertResult.success) {
    // Fallback: try individual inserts so partial success is possible
    let anyFailed = false;
    for (const { activityWithId, lsn } of infos) {
      const singleResult = await withRetry(async () => {
        await cdcDb.insert(activitiesTable).values(activityWithId).onConflictDoNothing();
      }, 'insert activity');

      if (!singleResult.success) {
        log.error('Activity insert failed permanently — event skipped', {
          activityId: activityWithId.id,
          lsn,
          tableName,
          action: activityWithId.action,
          subjectId: activityWithId.subjectId,
          err: singleResult.error });
        anyFailed = true;
      }
    }
    if (anyFailed) {
      circuitBreaker.recordFailure(tableName);
      return false;
    }
  }
  return true;
}

// Sync dispatch

/** Forward stamped events to the API server: one batch payload, or a single payload. */
function dispatchToApi(stamped: PreparedEvent[], traceCtx: TraceContext): void {
  if (stamped.length > 1) {
    const batchInfos: BatchEvent[] = stamped.map(({ activityWithId, rowData, seq, movedFrom }) => ({
      activity: activityWithId,
      rowData,
      seq,
      movedFrom }));
    sendBatchMessageToApi(batchInfos, traceCtx);
  } else {
    const { activityWithId, rowData, seq, movedFrom } = stamped[0];
    sendMessageToApi(activityWithId, rowData, traceCtx, seq, movedFrom);
  }
}

// Unified event processing

/**
 * Process one or more CDC events through three sequenced concerns:
 *   1. persist the activity/audit-log rows (all tracked tables)
 *   2. apply counter + seq deltas (entities and memberships)
 *   3. dispatch the real-time sync notification over WebSocket, then embedding cleanup
 * Handles both single-event and batch paths through a unified pipeline.
 */
export async function processEvents(events: Array<{ lsn: string; result: ParseMessageResult }>): Promise<void> {
  const firstLsn = events[0].lsn;
  const tableName = events[0].result.activity.tableName;
  const action = events[0].result.activity.action;
  const isBatch = events.length > 1;

  // Circuit breaker: skip events for tables with persistent failures
  if (!circuitBreaker.shouldProcess(tableName)) {
    log.debug('Skipping event — circuit open', { tableName, lsn: firstLsn, count: events.length });
    return;
  }

  await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn: firstLsn, tag: action, table: tableName }), async (traceCtx) => {
    const startMs = performance.now();

    // Compute unified deltas (pure, no side effects yet)
    const batchPlan = computeBatchUnifiedDeltas(events);

    // Prepare all activities (generate IDs, extract seq)
    const prepared = events.map(({ lsn, result }) => {
      replicationState.lastLsn = lsn;
      const { activityWithId, seq } = prepareActivity(result, lsn);
      return { activityWithId, seq, lsn, rowData: result.rowData, movedFrom: result.movedFrom ?? null };
    });

    // Persist activities FIRST: if this fails, no deltas are applied (no side effects)
    const persisted = await withSpan(cdcSpanNames.createActivity, activityAttrs(prepared[0].activityWithId), async () => {
      return persistActivities(prepared.map(({ activityWithId, lsn }) => ({ activityWithId, lsn })), tableName);
    });

    if (!persisted) {
      // Activity insert failed permanently: skip deltas and WS send
      return;
    }

    // Apply deltas SECOND: only after activities are safely persisted
    await applyBatchUnifiedDeltas(batchPlan);

    // Mirror channel paths onto counters rows (view-ancestry verification source)
    await syncChannelPaths(events);

    const stamped = prepared.map((item) => ({
      ...item,
      seq: typeof item.rowData.seq === 'number' ? item.rowData.seq : item.seq }));

    circuitBreaker.recordSuccess(tableName);

    // Log each activity creation
    for (const { activityWithId, lsn } of stamped) {
      log.trace(`Activity created from CDC`, {
        type: activityWithId.type,
        subjectId: activityWithId.subjectId,
        activityId: activityWithId.id,
        lsn,
        ...(activityWithId.changedFields && { changedFields: activityWithId.changedFields }) });
    }

    // Send the real-time sync notification (single vs batch payload)
    dispatchToApi(stamped, traceCtx);

    // Embedding cleanup: strip deleted embedded-entity IDs from host-entity arrays
    const { tableMeta } = events[0].result;
    if (tableMeta.kind === 'entity' && isProduct(tableMeta.type) && (action === 'update' || action === 'delete')) {
      await cleanupEmbeddingReferences(tableMeta.type, action, events);
    }

    metrics.recordProcessing(events.length, performance.now() - startMs);

    if (isBatch) {
      log.trace(`Batch processed`, {
        batchSize: events.length,
        entityType: events[0].result.activity.entityType,
        action });
    }
  });
}
