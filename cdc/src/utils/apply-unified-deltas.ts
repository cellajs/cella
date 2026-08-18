import { getTableName, sql } from 'drizzle-orm';
import format from 'pg-format';
import type { EntityHierarchy } from 'shared';
import { hierarchy } from 'shared';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { type BatchUnifiedDeltaPlan, frontierNodeKeys, mergeDelta } from './compute-unified-deltas';
import { isMaxMergeKey } from './update-counts';

// ── Counter upsert ───────────────────────────────────────────────────────────

/**
 * UPSERTs one channel_counters row through apply_count_deltas, which merges JSONB deltas as
 * GREATEST(0, existing + delta) per key and max-merges `e:li:`/`e:lu:`/`e:f:` keys. The SQL shape is
 * fixed so PostgreSQL can cache the plan.
 */
async function mergedUpsert(
  channelKey: string,
  deltas: Record<string, number>,
  returning: true,
): Promise<Record<string, number>>;
async function mergedUpsert(channelKey: string, deltas: Record<string, number>, returning?: false): Promise<void>;
async function mergedUpsert(
  channelKey: string,
  deltas: Record<string, number>,
  returning?: boolean,
  // biome-ignore lint/suspicious/noConfusingVoidType: void keeps this implementation compatible with the Promise<void> overload above
): Promise<Record<string, number> | void> {
  if (Object.keys(deltas).length === 0) return;

  const deltasJson = JSON.stringify(deltas);

  if (returning) {
    const result = await cdcDb.execute<{ counts: Record<string, number> }>(sql`
      INSERT INTO channel_counters (channel_key, counts, updated_at)
      VALUES (${channelKey}, apply_count_deltas('{}'::jsonb, ${deltasJson}::jsonb), NOW())
      ON CONFLICT (channel_key) DO UPDATE SET
        counts = apply_count_deltas(channel_counters.counts, ${deltasJson}::jsonb),
        updated_at = NOW()
      RETURNING counts
    `);
    return result.rows[0].counts as Record<string, number>;
  }

  await cdcDb.execute(sql`
    INSERT INTO channel_counters (channel_key, counts, updated_at)
    VALUES (${channelKey}, apply_count_deltas('{}'::jsonb, ${deltasJson}::jsonb), NOW())
    ON CONFLICT (channel_key) DO UPDATE SET
      counts = apply_count_deltas(channel_counters.counts, ${deltasJson}::jsonb),
      updated_at = NOW()
  `);
}

// ── Batch execution ──────────────────────────────────────────────────────────

/**
 * Adds `source` into `target` in place, summing on key collision. Max-merge keys keep the max, since
 * apply_count_deltas only ever moves stamps and frontiers forward.
 */
export function sumInto(
  target: Record<string, number>,
  source: Record<string, number> | undefined,
): Record<string, number> {
  if (source) {
    for (const [k, v] of Object.entries(source)) {
      target[k] = isMaxMergeKey(k) ? Math.max(target[k] ?? 0, v) : (target[k] ?? 0) + v;
    }
  }
  return target;
}

/**
 * Applies a batch delta plan and stamps eligible events with an organization sequence. Phase 1
 * reserves WAL-ordered sequence ranges; phase 2 writes ancestor frontiers, remaining counts, and the
 * row seq values.
 */
export async function applyBatchUnifiedDeltas(
  plan: BatchUnifiedDeltaPlan,
  h: EntityHierarchy = hierarchy,
): Promise<void> {
  const { orgSequenceGroups, countDeltasByChannelKey } = plan;

  const handledChannelKeys = new Set<string>();
  const allProductStamps: Array<{ tableName: string; id: string; seq: number }> = [];
  /** `e:f:` deltas and org-row leftovers for phase 2, keyed by channel node. */
  const phase2Deltas = new Map<string, Record<string, number>>();

  // Phase 1: one sequential RETURNING UPSERT per organization sequence.
  for (const group of orgSequenceGroups) {
    // The sequence reservation merges with any count deltas for the org row itself.
    const mergedDeltas = sumInto({ sequence: group.count }, countDeltasByChannelKey.get(group.orgKey));
    handledChannelKeys.add(group.orgKey);

    const counts = await mergedUpsert(group.orgKey, mergedDeltas, true);
    const highSeq = counts.sequence ?? group.count;
    const baseSeq = highSeq - group.count;

    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const { tableMeta, activity, rowData } = group.events[i].result;
      rowData.seq = seq;
      allProductStamps.push({ tableName: getTableName(tableMeta.table), id: rowData.id, seq });

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

    log.trace('Batch sequence stamped', {
      orgKey: group.orgKey,
      count: group.count,
      baseSeq: baseSeq + 1,
      highSeq,
    });
  }

  // Phase 2: frontier marks + remaining count UPSERTs + bulk entity stamp, all in parallel.
  for (const [channelKey, deltas] of countDeltasByChannelKey) {
    if (handledChannelKeys.has(channelKey)) continue;
    mergeDelta(phase2Deltas, channelKey, deltas);
  }

  const phase2: Promise<void>[] = [];
  for (const [channelKey, deltas] of phase2Deltas) {
    phase2.push(mergedUpsert(channelKey, deltas));
  }

  // Bulk seq stamp: one UPDATE ... FROM VALUES per table.
  if (allProductStamps.length > 0) {
    const byTable = new Map<string, Array<{ id: string; seq: number }>>();
    for (const stamp of allProductStamps) {
      const list = byTable.get(stamp.tableName);
      if (list) list.push(stamp);
      else byTable.set(stamp.tableName, [stamp]);
    }

    for (const [tableName, stamps] of byTable) {
      const valuesList = stamps.map((s) => sql`(${s.id}::uuid, ${s.seq}::bigint)`);
      phase2.push(
        cdcDb
          .execute(sql`
          UPDATE ${sql.raw(format('%I', tableName))} AS t
          SET seq = v.seq, stx = t.stx - 'changedFields'
          FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS v(id, seq)
          WHERE t.id = v.id
        `)
          .then(() => {}),
      );
    }
  }

  if (phase2.length > 0) {
    await Promise.all(phase2);
  }
}
