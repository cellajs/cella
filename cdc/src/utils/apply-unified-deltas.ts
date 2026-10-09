import { getTableName, sql } from 'drizzle-orm';
import type { EntityHierarchy } from 'shared';
import { hierarchy } from 'shared';
import type { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { type BatchUnifiedDeltaPlan, frontierNodeKeys, mergeDelta } from './compute-unified-deltas';
import { isMaxMergeKey } from './update-counts';

// ── Counter upsert ──────────────────────────────────────────────────────────────────────────────────────────────────

/** What the deltas are written through: the transaction of the flush they belong to. */
export type DeltaExecutor = Pick<typeof cdcDb, 'execute'>;

/** Rows per stamp statement: two bind parameters each, far below the protocol's 65,535. */
const STAMP_CHUNK_SIZE = 5000;

/**
 * UPSERTs one channel_counters row through apply_count_deltas, which merges JSONB deltas as
 * GREATEST(0, existing + delta) per key and max-merges `e:li:`/`e:lu:`/`e:f:` keys. The SQL shape is
 * fixed so PostgreSQL can cache the plan.
 */
export async function applyCounterDeltas(db: DeltaExecutor, channelKey: string, deltas: Record<string, number>): Promise<Record<string, number>> {
  if (Object.keys(deltas).length === 0) return {};

  const deltasJson = JSON.stringify(deltas);
  const result = await db.execute<{ counts: Record<string, number> }>(sql`
    INSERT INTO channel_counters (channel_key, counts, updated_at)
    VALUES (${channelKey}, apply_count_deltas('{}'::jsonb, ${deltasJson}::jsonb), NOW())
    ON CONFLICT (channel_key) DO UPDATE SET
      counts = apply_count_deltas(channel_counters.counts, ${deltasJson}::jsonb),
      updated_at = NOW()
    RETURNING counts
  `);
  return result.rows[0].counts as Record<string, number>;
}

// ── Batch execution ─────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Adds `source` into `target` in place, summing on key collision. Max-merge keys keep the max, since
 * apply_count_deltas only ever moves stamps and frontiers forward.
 */
export function sumInto(target: Record<string, number>, source: Record<string, number> | undefined): Record<string, number> {
  if (source) {
    for (const [k, v] of Object.entries(source)) {
      target[k] = isMaxMergeKey(k) ? Math.max(target[k] ?? 0, v) : (target[k] ?? 0) + v;
    }
  }
  return target;
}

/**
 * Applies a batch delta plan on the flush's transaction and stamps eligible events with an organization sequence.
 * Phase 1 reserves WAL-ordered sequence ranges; phase 2 writes ancestor frontiers, remaining counts, and the row seq
 * values. Every statement runs in a fixed order (organizations and counter rows by key, product rows by id), so two
 * transactions that touch the same rows take their locks the same way round.
 */
export async function applyBatchUnifiedDeltas(plan: BatchUnifiedDeltaPlan, db: DeltaExecutor, h: EntityHierarchy = hierarchy): Promise<void> {
  const { orgSequenceGroups, countDeltasByChannelKey } = plan;

  const handledChannelKeys = new Set<string>();
  /** The last seq of each row by table: a row changed twice in one flush is stamped once, with its newest position. */
  const lastSeqByTable = new Map<string, Map<string, number>>();
  /** `e:f:` deltas and org-row leftovers for phase 2, keyed by channel node. */
  const phase2Deltas = new Map<string, Record<string, number>>();

  // Phase 1: one RETURNING UPSERT per organization sequence.
  for (const group of [...orgSequenceGroups].sort((a, b) => a.orgKey.localeCompare(b.orgKey))) {
    // The sequence reservation merges with any count deltas for the org row itself.
    const mergedDeltas = sumInto({ sequence: group.count }, countDeltasByChannelKey.get(group.orgKey));
    handledChannelKeys.add(group.orgKey);

    const counts = await applyCounterDeltas(db, group.orgKey, mergedDeltas);
    const highSeq = counts.sequence ?? group.count;
    const baseSeq = highSeq - group.count;

    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const { tableMeta, activity, rowData } = group.events[i].result;
      rowData.seq = seq;
      const tableName = getTableName(tableMeta.table);
      const rows = lastSeqByTable.get(tableName) ?? new Map<string, number>();
      rows.set(rowData.id, seq);
      lastSeqByTable.set(tableName, rows);

      // Frontiers roll up to the organization and every populated ancestor.
      const nodes = frontierNodeKeys(tableMeta.type, rowData, activity.organizationId ?? group.orgKey, h);
      const frontierKey = `e:f:${tableMeta.type}`;
      for (const node of nodes) {
        mergeDelta(phase2Deltas, node, { [frontierKey]: seq });
      }
      // Self frontier at the home node only; frontierNodeKeys returns [org, mostSpecific, ...], so home is nodes[1].
      const home = nodes[1] ?? nodes[0] ?? group.orgKey;
      mergeDelta(phase2Deltas, home, { [`e:f:h:${tableMeta.type}`]: seq });
    }

    log.trace('Batch sequence stamped', { orgKey: group.orgKey, count: group.count, baseSeq: baseSeq + 1, highSeq });
  }

  // Phase 2: frontier marks and remaining count UPSERTs, then the entity stamps.
  for (const [channelKey, deltas] of countDeltasByChannelKey) {
    if (handledChannelKeys.has(channelKey)) continue;
    mergeDelta(phase2Deltas, channelKey, deltas);
  }
  for (const channelKey of [...phase2Deltas.keys()].sort()) {
    await applyCounterDeltas(db, channelKey, phase2Deltas.get(channelKey) ?? {});
  }

  for (const [tableName, rows] of lastSeqByTable) {
    const ids = [...rows.keys()].sort();
    for (let offset = 0; offset < ids.length; offset += STAMP_CHUNK_SIZE) {
      const chunk = ids.slice(offset, offset + STAMP_CHUNK_SIZE);
      // The rows are locked in id order first: the UPDATE below joins a VALUES list and takes its locks in no fixed order.
      const idList = sql.join(
        chunk.map((id) => sql`${id}::uuid`),
        sql`, `,
      );
      await db.execute(sql`SELECT 1 FROM ${sql.identifier(tableName)} WHERE id IN (${idList}) ORDER BY id FOR NO KEY UPDATE`);
      const valuesList = chunk.map((id) => sql`(${id}::uuid, ${rows.get(id)}::bigint)`);
      await db.execute(sql`
        UPDATE ${sql.identifier(tableName)} AS t
        SET seq = v.seq, stx = t.stx - 'changedFields'
        FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS v(id, seq)
        WHERE t.id = v.id
      `);
    }
  }
}
