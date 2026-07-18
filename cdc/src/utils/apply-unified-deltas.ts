import { getTableName } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import format from 'pg-format';
import { hierarchy, isUnpublishedDraft } from 'shared';
import type { AncestorSource } from 'shared';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import { type BatchUnifiedDeltaPlan, hwNodeKeys, mergeDelta } from './compute-unified-deltas';
import { isMaxMergeKey } from './update-counts';

// ── Counter upsert ───────────────────────────────────────────────────────────

/**
 * UPSERT a single channel_counters row using the apply_count_deltas PG function.
 * The function merges JSONB deltas with GREATEST(0, existing + delta) per key
 * (max-merge for `li:`/`lu:`/`hw:` keys).
 *
 * Fixed SQL shape enables PostgreSQL plan caching across repeated executions.
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
 * Add each source delta into `target` in place, summing on key collision.
 * Max-merge keys (`li:`/`lu:` stamps, `hw:` high-water marks) keep the max
 * (summing two timestamps or watermarks would corrupt them, since
 * apply_count_deltas only moves those keys forward). Exported for tests.
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
 * Apply a unified delta plan for a batch of CDC events. Mutates
 * `event.result.rowData.seq` for each stampable event.
 *
 * Phase 1 reserves one contiguous org-ledger range per organization
 * (`s:ledger` via RETURNING) and assigns values to events in WAL order —
 * all product entity types share the ledger, so WAL commit order IS ledger
 * order. Phase 2 then writes high-water (`hw:{type}`) marks at every
 * ancestor node, the remaining count deltas, and the row seq stamp-backs.
 */
export async function applyBatchUnifiedDeltas(plan: BatchUnifiedDeltaPlan, h: AncestorSource = hierarchy): Promise<void> {
  const { ledgerGroups, countDeltasByChannelKey } = plan;

  const handledChannelKeys = new Set<string>();
  const allEntityStamps: Array<{ tableName: string; id: string; seq: number }> = [];
  /** hw: (and org-row leftovers) accumulated for phase 2, keyed by channel node. */
  const phase2Deltas = new Map<string, Record<string, number>>();

  // Phase 1: one sequential RETURNING UPSERT per organization ledger.
  for (const group of ledgerGroups) {
    // Merge the ledger reservation with any count deltas for the org row itself.
    const mergedDeltas = sumInto({ 's:ledger': group.count }, countDeltasByChannelKey.get(group.orgKey));
    handledChannelKeys.add(group.orgKey);

    const counts = await mergedUpsert(group.orgKey, mergedDeltas, true);
    const highSeq = counts['s:ledger'] ?? group.count;
    const baseSeq = highSeq - group.count;

    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const { tableMeta, activity, rowData } = group.events[i].result;
      rowData.seq = seq;
      allEntityStamps.push({ tableName: getTableName(tableMeta.table), id: rowData.id, seq });

      // High-water rollups. Unpublished drafts are excluded: they take a ledger stamp
      // (uniform stamp-back, stx cleanup) but are invisible to delta reads/dispatch/
      // counters until the publish edge, so bumping hw would only signal activity-timing
      // no view can ever fetch. Tombstones of PUBLISHED rows still bump (they are
      // delta-fetchable); the publish edge bumps (row is published); the unpublish edge
      // does not (detected via count drift, as before).
      if (isUnpublishedDraft(rowData)) continue;
      // Subtree: hw:{type} max-merged at the org and every non-null ancestor.
      const nodes = hwNodeKeys(tableMeta.type, rowData, activity.organizationId ?? group.orgKey, h);
      const hwKey = `hw:${tableMeta.type}`;
      for (const node of nodes) {
        mergeDelta(phase2Deltas, node, { [hwKey]: seq });
      }
      // Self: hws:{type} at the HOME node only (deepest non-null ancestor, org fallback) —
      // answers self views (rows homed at the node), mirroring the li:/lu: placement rule.
      // hwNodeKeys order is [org, mostSpecific, …, nearRoot], so home is nodes[1] ?? org.
      const home = nodes[1] ?? nodes[0] ?? group.orgKey;
      mergeDelta(phase2Deltas, home, { [`hws:${tableMeta.type}`]: seq });
    }

    log.trace('Batch ledger stamped', {
      orgKey: group.orgKey,
      count: group.count,
      baseSeq: baseSeq + 1,
      highSeq,
    });
  }

  // Phase 2: hw marks + remaining count UPSERTs + bulk entity stamp, all in parallel.
  for (const [channelKey, deltas] of countDeltasByChannelKey) {
    if (handledChannelKeys.has(channelKey)) continue;
    mergeDelta(phase2Deltas, channelKey, deltas);
  }

  const phase2: Promise<void>[] = [];
  for (const [channelKey, deltas] of phase2Deltas) {
    phase2.push(mergedUpsert(channelKey, deltas));
  }

  // Bulk entity seq stamp: one UPDATE ... FROM VALUES per table
  if (allEntityStamps.length > 0) {
    const byTable = new Map<string, Array<{ id: string; seq: number }>>();
    for (const stamp of allEntityStamps) {
      const list = byTable.get(stamp.tableName);
      if (list) list.push(stamp);
      else byTable.set(stamp.tableName, [stamp]);
    }

    for (const [tableName, stamps] of byTable) {
      const valuesList = stamps.map((s) => sql`(${s.id}::uuid, ${s.seq}::bigint)`);
      phase2.push(
        cdcDb.execute(sql`
          UPDATE ${sql.raw(format('%I', tableName))} AS t
          SET seq = v.seq, stx = t.stx - 'changedFields'
          FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS v(id, seq)
          WHERE t.id = v.id
        `).then(() => {}),
      );
    }
  }

  if (phase2.length > 0) {
    await Promise.all(phase2);
  }
}
