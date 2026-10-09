import { sql } from 'drizzle-orm';
import { hierarchy, isProduct, type ProductEntityType } from 'shared';
import { activitiesTable } from '#/modules/activities/activities-db';
import { embeddingsAfterDispatch } from '../embeddings';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { activityAttrs, cdcAttrs, cdcSpanNames, withSpan } from '../lib/tracing';
import { wsClient } from '../network/websocket-client';
import { generateActivityId, type ProductRow, sendMessageToApi, sendProductMessagesToApi } from '../services/activity-service';
import { metrics } from '../services/cdc-metrics';
import { addCounts, type CounterDeltas, fence, plainCounts } from '../services/fence';
import type { PendingEvent } from '../types';
import { applyBatchUnifiedDeltas } from '../utils/apply-unified-deltas';
import { syncChannelPaths } from '../utils/channel-path-sync';
import { computeBatchUnifiedDeltas, isStampable } from '../utils/compute-unified-deltas';

/** A change with the activity it is recorded as: the parsed activity plus its id. */
interface PreparedEvent {
  event: PendingEvent;
  activity: ProductRow['activity'];
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

/** Row ids per read of the seq a change's row already holds, when the change is delivered again: one parameter each. */
const READ_BACK_CHUNK_SIZE = 5000;

/** The product type of a change's row; null for a row that is no product: a membership, a tenant, a channel. */
const productTypeOf = ({ result: { tableMeta } }: PendingEvent): ProductEntityType | null =>
  tableMeta.kind === 'entity' && isProduct(tableMeta.type) ? tableMeta.type : null;

/** The sequence value a product row holds once its flush is recorded. A delete leaves none. */
const seqOf = ({ result: { rowData } }: PendingEvent): number | undefined => (typeof rowData.seq === 'number' ? rowData.seq : undefined);

/**
 * Records a flush, in commit order and in one transaction: the activity rows, then the sequence values, counters and
 * row stamps of the changes whose activity this transaction inserted. An activity id comes from the commit position of
 * its source transaction and its index there, so a change delivered a second time inserts nothing and changes nothing:
 * its row keeps the seq it got the first time, read back here for the message.
 */
async function recordFlush(prepared: PreparedEvent[]): Promise<void> {
  let counted: CounterDeltas = new Map();
  await cdcDb.transaction(async (tx) => {
    const insertedIds = new Set<string>();
    for (let offset = 0; offset < prepared.length; offset += ACTIVITY_CHUNK_SIZE) {
      const chunk = prepared.slice(offset, offset + ACTIVITY_CHUNK_SIZE).map((item) => item.activity);
      const inserted = await tx.insert(activitiesTable).values(chunk).onConflictDoNothing().returning({ id: activitiesTable.id });
      for (const row of inserted) insertedIds.add(row.id);
    }

    const fresh = prepared.filter((item) => insertedIds.has(item.activity.id)).map((item) => item.event);
    if (fresh.length > 0) {
      const plan = computeBatchUnifiedDeltas(fresh);
      // A recount that the stream has not passed yet already saw some of these source transactions.
      const seen = fresh.filter((event) => fence.sawTransaction(event.xid));
      if (seen.length > 0) {
        counted = plainCounts(computeBatchUnifiedDeltas(seen).countDeltasByChannelKey);
        // A rebuild wrote the count itself: what it saw is not counted a second time. A verify only compares.
        if (fence.mode === 'rebuild') addCounts(plan.countDeltasByChannelKey, counted, -1);
      }
      await applyBatchUnifiedDeltas(plan, tx);
    }

    const again = prepared
      .filter((item) => !insertedIds.has(item.activity.id))
      .map((item) => item.event.result)
      .filter(({ tableMeta, activity }) => isStampable(tableMeta, activity.action, hierarchy));
    for (const [tableName, results] of groupBy(again, (result) => result.activity.tableName)) {
      const seqById = new Map<string, number>();
      const ids = [...new Set(results.map((result) => result.rowData.id))];
      for (let offset = 0; offset < ids.length; offset += READ_BACK_CHUNK_SIZE) {
        const idList = sql.join(
          ids.slice(offset, offset + READ_BACK_CHUNK_SIZE).map((id) => sql`${id}::uuid`),
          sql`, `,
        );
        const stored = await tx.execute<{ id: string; seq: string }>(sql`SELECT id, seq FROM ${sql.identifier(tableName)} WHERE id IN (${idList})`);
        for (const row of stored.rows) seqById.set(row.id, Number(row.seq));
      }
      for (const { rowData } of results) rowData.seq = seqById.get(rowData.id) ?? rowData.seq;
    }
  });
  // Only what the transaction committed counts towards the comparison.
  fence.addCounted(counted);
}

/**
 * One flush, in commit order across entity types and actions:
 *   1. wait for the API: a change the worker cannot hand over is left in the WAL
 *   2. record it in one transaction: activity rows, sequence values, counters, row stamps
 *   3. mirror channel paths, then hand the changes to the API and clean up embeddings
 *
 * Step 2 happens exactly once per change however often the change is delivered; step 3 repeats when it is delivered
 * again, and each part of it is safe to repeat. Whatever fails rejects the flush: the caller then acknowledges nothing
 * and the stream is read again from the last acknowledged position. Nothing is retried here and nothing is left out.
 */
export async function processFlush(transactions: PendingEvent[][]): Promise<void> {
  const startMs = performance.now();
  await wsClient.whenConnected();

  const prepared: PreparedEvent[] = transactions
    .flat()
    .map((event) => ({ event, activity: { ...event.result.activity, id: generateActivityId(event) } }));
  if (prepared.length === 0) return;

  await withSpan(cdcSpanNames.createActivity, activityAttrs(prepared[0].activity), () => recordFlush(prepared));

  // Mirror channel paths onto counters rows: the view-ancestry verification source.
  await syncChannelPaths(prepared.map((item) => item.event));

  // A row that is no product goes to the API alone and in commit order: its listeners act on that one row.
  for (const { event, activity } of prepared) {
    if (productTypeOf(event)) continue;
    const { rowData, movedFrom } = event.result;
    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn: event.lsn, tag: activity.action, table: activity.tableName }), async (traceCtx) =>
      sendMessageToApi(activity, rowData, traceCtx, movedFrom),
    );
  }

  // Product rows go per type and action, one message per audience.
  const products = prepared.flatMap((item) => {
    const productType = productTypeOf(item.event);
    return productType ? [{ ...item, productType }] : [];
  });
  for (const group of groupBy(products, ({ productType, activity }) => `${productType}:${activity.action}`).values()) {
    const events = group.map((item) => item.event);
    const { productType, activity } = group[0];
    const { action } = activity;

    await withSpan(cdcSpanNames.processWal, cdcAttrs({ lsn: events[0].lsn, tag: action, table: activity.tableName }), async (traceCtx) => {
      // Read after recording: a row's seq is its stamp, or the one it already held when the change is delivered again.
      const rows = group.map((item) => ({
        activity: item.activity,
        rowData: item.event.result.rowData,
        seq: seqOf(item.event),
        movedFrom: item.event.result.movedFrom,
      }));
      sendProductMessagesToApi(productType, rows, traceCtx);
      await embeddingsAfterDispatch(productType, action, events);
    });

    log.trace('Group processed', { groupSize: group.length, entityType: activity.entityType, action });
  }

  metrics.recordProcessing(prepared.length, performance.now() - startMs);
}
