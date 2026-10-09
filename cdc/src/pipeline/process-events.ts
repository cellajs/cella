import { sql } from 'drizzle-orm';
import { isProduct } from 'shared';
import { activitiesTable } from '#/modules/activities/activities-db';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { TraceContext } from '../lib/tracing';
import { activityAttrs, cdcAttrs, cdcSpanNames, withSpan } from '../lib/tracing';
import { wsClient } from '../network/websocket-client';
import { type BatchEvent, generateActivityId, sendBatchMessageToApi, sendMessageToApi } from '../services/activity-service';
import { metrics } from '../services/cdc-metrics';
import { ApiUnreachableError } from '../services/failure';
import { addCounts, type CounterDeltas, fence, plainCounts } from '../services/fence';
import { replicationState } from '../services/replication-state';
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

/** Row ids per read of the seq a redelivered event's row already holds: one parameter each. */
const READ_BACK_CHUNK_SIZE = 5000;

function prepareEvent(event: PendingEvent): PreparedEvent {
  const { lsn, result } = event;
  const activityWithId = { ...result.activity, id: generateActivityId(event) };
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
 * from the commit position of its transaction and its index there, so an event delivered a second time inserts nothing and changes nothing:
 * its row keeps the seq it got the first time, read back here for the notification.
 */
async function recordFlush(prepared: PreparedEvent[]): Promise<void> {
  let counted: CounterDeltas = new Map();
  await cdcDb.transaction(async (tx) => {
    const insertedIds = new Set<string>();
    for (let offset = 0; offset < prepared.length; offset += ACTIVITY_CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + ACTIVITY_CHUNK_SIZE).map((item) => item.activityWithId);
      const inserted = await tx.insert(activitiesTable).values(chunk).onConflictDoNothing().returning({ id: activitiesTable.id });
      for (const row of inserted) insertedIds.add(row.id);
    }

    const fresh = prepared.filter((item) => insertedIds.has(item.activityWithId.id));
    if (fresh.length > 0) {
      const plan = computeBatchUnifiedDeltas(fresh.map((item) => item.event));
      // A count from the tables that is still being caught up with already saw some of these transactions.
      const seen = fresh.filter((item) => fence.sawTransaction(item.event.xid));
      if (seen.length > 0) {
        counted = plainCounts(computeBatchUnifiedDeltas(seen.map((item) => item.event)).countDeltasByChannelKey);
        // A rebuild wrote the count itself: what it saw is not counted a second time. A verify only compares.
        if (fence.mode === 'rebuild') addCounts(plan.countDeltasByChannelKey, counted, -1);
      }
      await applyBatchUnifiedDeltas(plan, tx);
    }

    const replayed = prepared.filter((item) => !insertedIds.has(item.activityWithId.id) && isStampedEvent(item));
    for (const [tableName, items] of groupBy(replayed, (item) => item.event.result.activity.tableName)) {
      const seqById = new Map<string, number>();
      const ids = [...new Set(items.map((item) => item.rowData.id))];
      for (let offset = 0; offset < ids.length; offset += READ_BACK_CHUNK_SIZE) {
        const idList = sql.join(
          ids.slice(offset, offset + READ_BACK_CHUNK_SIZE).map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        const stored = await tx.execute<{ id: string; seq: string }>(sql`SELECT id, seq FROM ${sql.identifier(tableName)} WHERE id IN (${idList})`);
        for (const row of stored.rows) seqById.set(row.id, Number(row.seq));
      }
      for (const item of items) item.rowData.seq = seqById.get(item.rowData.id) ?? item.rowData.seq;
    }
  });
  // Only what the transaction committed counts towards the comparison.
  fence.addCounted(counted);
}

// Sync dispatch

const isProductEvent = ({ event }: PreparedEvent): boolean => {
  const { tableMeta } = event.result;
  return tableMeta.kind === 'entity' && isProduct(tableMeta.type);
};

/**
 * Forwards product rows of one type and action to the API: one batch payload, or a single payload.
 * @returns false when the API did not take a message.
 */
function dispatchToApi(stamped: PreparedEvent[], traceCtx: TraceContext): boolean {
  if (stamped.length > 1) {
    const batchInfos: BatchEvent[] = stamped.map(({ activityWithId, rowData, seq, movedFrom }) => ({
      activity: activityWithId,
      rowData,
      seq,
      movedFrom,
    }));
    return sendBatchMessageToApi(batchInfos, traceCtx);
  }
  const { activityWithId, rowData, seq, movedFrom } = stamped[0];
  return sendMessageToApi(activityWithId, rowData, traceCtx, seq, movedFrom);
}

// Flush processing

/**
 * One flush, in commit order across entity types and actions:
 *   1. wait for the API: a change the worker cannot hand over is left in the WAL
 *   2. record it in one transaction: activity rows, sequence positions, counters, row stamps
 *   3. mirror channel paths, then hand the changes to the API and clean up embeddings
 *
 * Step 2 happens exactly once per event however often the event is delivered; step 3 repeats on a redelivery, and each
 * part of it is safe to repeat. Whatever fails rejects the flush: the caller then acknowledges nothing and the stream
 * is read again from the last acknowledged position. Nothing is retried here and nothing is left out.
 */
export async function processFlush(transactions: PendingEvent[][]): Promise<void> {
  const startMs = performance.now();
  await wsClient.whenConnected();

  const prepared = transactions.flat().map(prepareEvent);
  if (prepared.length === 0) return;
  replicationState.lastLsn = prepared[prepared.length - 1].lsn;

  await withSpan(cdcSpanNames.createActivity, activityAttrs(prepared[0].activityWithId), () => recordFlush(prepared));

  const groups = groupBy(prepared, ({ event }) => `${event.result.tableMeta.type}:${event.result.activity.action}`);

  // Mirror channel paths onto counters rows: the view-ancestry verification source.
  for (const group of groups.values()) await syncChannelPaths(group.map((item) => item.event));

  // A row that is no product goes to the API alone and in commit order: its listeners act on that one row.
  for (const item of prepared) {
    if (isProductEvent(item)) continue;
    const { activityWithId, rowData, lsn, movedFrom } = item;
    const attrs = cdcAttrs({ lsn, tag: activityWithId.action, table: activityWithId.tableName });
    const sent = await withSpan(cdcSpanNames.processWal, attrs, async (traceCtx) =>
      sendMessageToApi(activityWithId, rowData, traceCtx, undefined, movedFrom),
    );
    if (!sent) throw new ApiUnreachableError();
  }

  // Product rows go per type and action, one notification per audience.
  for (const group of groups.values()) {
    const groupEvents = group.map((item) => item.event);
    const { tableMeta, activity } = groupEvents[0].result;
    if (tableMeta.kind !== 'entity' || !isProduct(tableMeta.type)) continue;
    const productType = tableMeta.type;

    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn: group[0].lsn, tag: activity.action, table: activity.tableName }), async (traceCtx) => {
      const stamped = group.map((item) => ({ ...item, seq: typeof item.rowData.seq === 'number' ? item.rowData.seq : item.seq }));
      if (!dispatchToApi(stamped, traceCtx)) throw new ApiUnreachableError();

      // Strip deleted embedded-entity ids from host-entity arrays.
      if (activity.action === 'update' || activity.action === 'delete') await cleanupEmbeddingReferences(productType, activity.action, groupEvents);

      // Soft-delete embedded rows their host arrays stopped referencing; hard deletes ride FK cascades.
      if (activity.action === 'update') await gcOwnedEmbeddedRows(productType, groupEvents);
    });

    log.trace('Group processed', { groupSize: group.length, entityType: activity.entityType, action: activity.action });
  }

  metrics.recordProcessing(prepared.length, performance.now() - startMs);
}
