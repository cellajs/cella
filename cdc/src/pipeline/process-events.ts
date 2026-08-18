import { isProduct } from 'shared';
import { activitiesTable } from '#/modules/activities/activities-db';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import { activityAttrs, cdcAttrs, cdcSpanNames, withSpan } from '../lib/tracing';
import {
  type BatchEvent,
  generateActivityId,
  sendBatchMessageToApi,
  sendMessageToApi,
} from '../services/activity-service';
import { metrics } from '../services/cdc-metrics';
import { circuitBreaker } from '../services/circuit-breaker';
import { replicationState } from '../services/replication-state';
import { withRetry } from '../services/retry';
import type { CdcRowData } from '../types';
import { applyBatchUnifiedDeltas } from '../utils/apply-unified-deltas';
import { syncChannelPaths } from '../utils/channel-path-sync';
import { computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import { cleanupEmbeddingReferences } from '../utils/embedding-cleanup';
import { gcOwnedEmbeddedRows } from '../utils/owned-embedding-gc';
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
 * Multi-row insert with retry, falling back to individual inserts.
 * @returns false when persistence failed, in which case the caller must skip deltas.
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
      log.error('Activity insert failed permanently: event skipped', {
        activityId: activityWithId.id,
        lsn,
        tableName,
        action: activityWithId.action,
        subjectId: activityWithId.subjectId,
        err: insertResult.error,
      });
      circuitBreaker.recordFailure(tableName);
      return false;
    }

    if (insertResult.attempts > 1) {
      log.info('Activity insert succeeded after retry', {
        activityId: activityWithId.id,
        attempts: insertResult.attempts,
        lsn,
      });
    }
    return true;
  }

  const insertResult = await withRetry(async () => {
    await cdcDb
      .insert(activitiesTable)
      .values(infos.map((i) => i.activityWithId))
      .onConflictDoNothing();
  }, 'batch insert activities');

  if (!insertResult.success) {
    // Individual inserts allow partial success.
    let anyFailed = false;
    for (const { activityWithId, lsn } of infos) {
      const singleResult = await withRetry(async () => {
        await cdcDb.insert(activitiesTable).values(activityWithId).onConflictDoNothing();
      }, 'insert activity');

      if (!singleResult.success) {
        log.error('Activity insert failed permanently: event skipped', {
          activityId: activityWithId.id,
          lsn,
          tableName,
          action: activityWithId.action,
          subjectId: activityWithId.subjectId,
          err: singleResult.error,
        });
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
      movedFrom,
    }));
    sendBatchMessageToApi(batchInfos, traceCtx);
  } else {
    const { activityWithId, rowData, seq, movedFrom } = stamped[0];
    sendMessageToApi(activityWithId, rowData, traceCtx, seq, movedFrom);
  }
}

// Unified event processing

/**
 * Three ordered stages, single events and batches alike:
 *   1. persist the activity rows (all tracked tables)
 *   2. apply counter + seq deltas (entities and memberships)
 *   3. dispatch the sync notification over WebSocket, then embedding cleanup
 */
export async function processEvents(events: Array<{ lsn: string; result: ParseMessageResult }>): Promise<void> {
  const firstLsn = events[0].lsn;
  const tableName = events[0].result.activity.tableName;
  const action = events[0].result.activity.action;
  const isBatch = events.length > 1;

  // Circuit breaker: skip events for tables with persistent failures
  if (!circuitBreaker.shouldProcess(tableName)) {
    log.debug('Skipping event, circuit open', { tableName, lsn: firstLsn, count: events.length });
    return;
  }

  await withSpan(
    cdcSpanNames.processWal,
    cdcAttrs({ lsn: firstLsn, tag: action, table: tableName }),
    async (traceCtx) => {
      const startMs = performance.now();

      // Pure: no side effects until applyBatchUnifiedDeltas below.
      const batchPlan = computeBatchUnifiedDeltas(events);

      const prepared = events.map(({ lsn, result }) => {
        replicationState.lastLsn = lsn;
        const { activityWithId, seq } = prepareActivity(result, lsn);
        return { activityWithId, seq, lsn, rowData: result.rowData, movedFrom: result.movedFrom ?? null };
      });

      // Persist first: a failure here leaves no deltas applied.
      const persisted = await withSpan(
        cdcSpanNames.createActivity,
        activityAttrs(prepared[0].activityWithId),
        async () => {
          return persistActivities(
            prepared.map(({ activityWithId, lsn }) => ({ activityWithId, lsn })),
            tableName,
          );
        },
      );

      if (!persisted) {
        return;
      }

      await applyBatchUnifiedDeltas(batchPlan);

      // Mirror channel paths onto counters rows: the view-ancestry verification source.
      await syncChannelPaths(events);

      const stamped = prepared.map((item) => ({
        ...item,
        seq: typeof item.rowData.seq === 'number' ? item.rowData.seq : item.seq,
      }));

      circuitBreaker.recordSuccess(tableName);

      for (const { activityWithId, lsn } of stamped) {
        log.trace('Activity created from CDC', {
          type: activityWithId.type,
          subjectId: activityWithId.subjectId,
          activityId: activityWithId.id,
          lsn,
          ...(activityWithId.changedFields && { changedFields: activityWithId.changedFields }),
        });
      }

      dispatchToApi(stamped, traceCtx);

      // Strip deleted embedded-entity ids from host-entity arrays.
      const { tableMeta } = events[0].result;
      if (tableMeta.kind === 'entity' && isProduct(tableMeta.type) && (action === 'update' || action === 'delete')) {
        await cleanupEmbeddingReferences(tableMeta.type, action, events);
      }

      // Soft-delete embedded rows their host arrays stopped referencing; hard deletes ride FK cascades.
      if (tableMeta.kind === 'entity' && isProduct(tableMeta.type) && action === 'update') {
        await gcOwnedEmbeddedRows(tableMeta.type, events);
      }

      metrics.recordProcessing(events.length, performance.now() - startMs);

      if (isBatch) {
        log.trace('Batch processed', {
          batchSize: events.length,
          entityType: events[0].result.activity.entityType,
          action,
        });
      }
    },
  );
}
