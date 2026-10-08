import { sql } from 'drizzle-orm';
import { isProduct } from 'shared';
import { activitiesTable } from '#/modules/activities/activities-db';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import { activityAttrs, cdcAttrs, cdcSpanNames, withSpan } from '../lib/tracing';
import { type BatchEvent, generateActivityId, sendBatchMessageToApi, sendMessageToApi } from '../services/activity-service';
import { metrics } from '../services/cdc-metrics';
import { circuitBreaker } from '../services/circuit-breaker';
import { replicationState } from '../services/replication-state';
import { isTransientError, withRetry } from '../services/retry';
import type { CdcRowData, PendingEvent } from '../types';
import { applyBatchUnifiedDeltas } from '../utils/apply-unified-deltas';
import { syncChannelPaths } from '../utils/channel-path-sync';
import { computeBatchUnifiedDeltas } from '../utils/compute-unified-deltas';
import { cleanupEmbeddingReferences } from '../utils/embedding-cleanup';
import { gcOwnedEmbeddedRows } from '../utils/owned-embedding-gc';

/** An event prepared for persistence + dispatch: activity with a generated id, its row data, and seq. */
interface PreparedEvent {
  event: PendingEvent;
  activityWithId: BatchEvent['activity'];
  seq: number | undefined;
  lsn: string;
  rowData: CdcRowData;
  movedFrom: CdcRowData | null;
}

/** Groups in the order their keys first appear. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** Rows per activity insert: a row binds about twenty parameters, and one statement takes 65,535 at most. */
const ACTIVITY_CHUNK_SIZE = 1000;

function prepareEvent(event: PendingEvent): PreparedEvent {
  const { lsn, result } = event;
  const activityWithId = { ...result.activity, id: generateActivityId(lsn) };
  const seq = typeof result.rowData.seq === 'number' ? result.rowData.seq : undefined;
  return { event, activityWithId, seq, lsn, rowData: result.rowData, movedFrom: result.movedFrom ?? null };
}

const isStampedEvent = ({ event }: PreparedEvent): boolean => {
  const { tableMeta, activity } = event.result;
  return tableMeta.kind === 'entity' && isProduct(tableMeta.type) && (activity.action === 'create' || activity.action === 'update');
};

/**
 * The bookkeeping of a flush, in commit order and in one transaction: the activity rows, then the sequence
 * reservation, counters and row stamps of the events whose activity this transaction inserted. An activity id comes
 * from the event's LSN, so an event delivered a second time inserts nothing and changes nothing: its row keeps the seq
 * it got the first time, read back here for the notification.
 */
async function recordFlush(prepared: PreparedEvent[]): Promise<void> {
  await cdcDb.transaction(async (tx) => {
    const insertedIds = new Set<string>();
    for (let offset = 0; offset < prepared.length; offset += ACTIVITY_CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + ACTIVITY_CHUNK_SIZE).map((item) => item.activityWithId);
      const inserted = await tx.insert(activitiesTable).values(chunk).onConflictDoNothing().returning({ id: activitiesTable.id });
      for (const row of inserted) insertedIds.add(row.id);
    }

    const fresh = prepared.filter((item) => insertedIds.has(item.activityWithId.id));
    if (fresh.length > 0) await applyBatchUnifiedDeltas(computeBatchUnifiedDeltas(fresh.map((item) => item.event)), tx);

    const replayed = prepared.filter((item) => !insertedIds.has(item.activityWithId.id) && isStampedEvent(item));
    for (const [tableName, items] of groupBy(replayed, (item) => item.event.result.activity.tableName)) {
      const idList = sql.join(
        items.map((item) => sql`${item.rowData.id}::uuid`),
        sql`, `,
      );
      const stored = await tx.execute<{ id: string; seq: string }>(sql`SELECT id, seq FROM ${sql.identifier(tableName)} WHERE id IN (${idList})`);
      const seqById = new Map(stored.rows.map((row) => [row.id, Number(row.seq)]));
      for (const item of items) item.rowData.seq = seqById.get(item.rowData.id) ?? item.rowData.seq;
    }
  });
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

// Flush processing

/**
 * One flush, in commit order across entity types and actions:
 *   1. record it in one transaction: activity rows, sequence positions, counters, row stamps
 *   2. per (type, action) group: mirror channel paths, dispatch the sync notification over WebSocket, clean up embeddings
 *
 * Step 1 happens exactly once per event however often the event is delivered; step 2 repeats on a redelivery, and each
 * part of it is safe to repeat. A deadlock or another passing database error repeats the transaction. Events of a
 * table whose circuit is open are left out.
 */
async function applyFlush(events: PendingEvent[]): Promise<void> {
  const startMs = performance.now();
  const prepared = events.filter((event) => circuitBreaker.shouldProcess(event.result.activity.tableName)).map(prepareEvent);
  if (prepared.length === 0) return;
  replicationState.lastLsn = prepared[prepared.length - 1].lsn;

  const recorded = await withSpan(cdcSpanNames.createActivity, activityAttrs(prepared[0].activityWithId), () =>
    withRetry(() => recordFlush(prepared), 'record flush'),
  );
  if (!recorded.success) throw recorded.error;

  const groups = groupBy(prepared, ({ event }) => `${event.result.tableMeta.type}:${event.result.activity.action}`);
  for (const group of groups.values()) {
    const groupEvents = group.map((item) => item.event);
    const { tableMeta, activity } = groupEvents[0].result;

    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn: group[0].lsn, tag: activity.action, table: activity.tableName }), async (traceCtx) => {
      // Mirror channel paths onto counters rows: the view-ancestry verification source.
      await syncChannelPaths(groupEvents);

      const stamped = group.map((item) => ({ ...item, seq: typeof item.rowData.seq === 'number' ? item.rowData.seq : item.seq }));
      dispatchToApi(stamped, traceCtx);

      // Strip deleted embedded-entity ids from host-entity arrays.
      if (tableMeta.kind === 'entity' && isProduct(tableMeta.type) && (activity.action === 'update' || activity.action === 'delete')) {
        await cleanupEmbeddingReferences(tableMeta.type, activity.action, groupEvents);
      }

      // Soft-delete embedded rows their host arrays stopped referencing; hard deletes ride FK cascades.
      if (tableMeta.kind === 'entity' && isProduct(tableMeta.type) && activity.action === 'update') {
        await gcOwnedEmbeddedRows(tableMeta.type, groupEvents);
      }
    });

    circuitBreaker.recordSuccess(activity.tableName);
    log.trace('Group processed', { groupSize: group.length, entityType: activity.entityType, action: activity.action });
  }

  metrics.recordProcessing(prepared.length, performance.now() - startMs);
}

/**
 * Processes the source transactions of one flush together. When that fails, one source transaction at a time, to find
 * the one that cannot be recorded: its failure counts against its tables' circuits, unless the error is a passing one,
 * and rejects the flush. The caller then acknowledges nothing and the stream is read again from the last acknowledged
 * position, where an open circuit lets the rest of the stream pass.
 */
export async function processFlush(transactions: PendingEvent[][]): Promise<void> {
  try {
    await applyFlush(transactions.flat());
    return;
  } catch (error) {
    log.warn('Flush failed, processing its source transactions one at a time', { err: error, transactions: transactions.length });
  }

  for (const transaction of transactions) {
    try {
      await applyFlush(transaction);
    } catch (error) {
      if (!isTransientError(error)) {
        for (const tableName of new Set(transaction.map((event) => event.result.activity.tableName))) circuitBreaker.recordFailure(tableName);
      }
      throw error;
    }
  }
}
