import { sql } from 'drizzle-orm';
import format from 'pg-format';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { BatchUnifiedDeltaPlan } from './compute-unified-deltas';

// ── Counter upsert ───────────────────────────────────────────────────────────

/**
 * UPSERT a single context_counters row using the apply_count_deltas PG function.
 * The function merges JSONB deltas with GREATEST(0, existing + delta) per key.
 *
 * Fixed SQL shape enables PostgreSQL plan caching across repeated executions.
 */
async function mergedUpsert(
  contextKey: string,
  deltas: Record<string, number>,
  returning: true,
): Promise<Record<string, number>>;
async function mergedUpsert(contextKey: string, deltas: Record<string, number>, returning?: false): Promise<void>;
async function mergedUpsert(
  contextKey: string,
  deltas: Record<string, number>,
  returning?: boolean,
): Promise<Record<string, number> | void> {
  if (Object.keys(deltas).length === 0) return;

  const deltasJson = JSON.stringify(deltas);

  if (returning) {
    const result = await cdcDb.execute<{ counts: Record<string, number> }>(sql`
      INSERT INTO context_counters (context_key, counts, updated_at)
      VALUES (${contextKey}, apply_count_deltas('{}'::jsonb, ${deltasJson}::jsonb), NOW())
      ON CONFLICT (context_key) DO UPDATE SET
        counts = apply_count_deltas(context_counters.counts, ${deltasJson}::jsonb),
        updated_at = NOW()
      RETURNING counts
    `);
    return result.rows[0].counts as Record<string, number>;
  }

  await cdcDb.execute(sql`
    INSERT INTO context_counters (context_key, counts, updated_at)
    VALUES (${contextKey}, apply_count_deltas('{}'::jsonb, ${deltasJson}::jsonb), NOW())
    ON CONFLICT (context_key) DO UPDATE SET
      counts = apply_count_deltas(context_counters.counts, ${deltasJson}::jsonb),
      updated_at = NOW()
  `);
}

// ── Batch execution ──────────────────────────────────────────────────────────

/**
 * Add each source delta into `target` in place, summing on key collision.
 * `last:` keys are epoch-ms activity stamps, not deltas: collisions keep the max
 * (summing two timestamps would jump far into the future and never heal, since
 * apply_count_deltas only moves `last:` keys forward). Exported for tests.
 */
export function sumInto(
  target: Record<string, number>,
  source: Record<string, number> | undefined,
): Record<string, number> {
  if (source) {
    for (const [k, v] of Object.entries(source)) {
      target[k] = k.startsWith('last:') ? Math.max(target[k] ?? 0, v) : (target[k] ?? 0) + v;
    }
  }
  return target;
}

/**
 * Apply a unified delta plan for a batch of CDC events. Mutates
 * `event.result.rowData.seq` for each stampable event.
 */
export async function applyBatchUnifiedDeltas(plan: BatchUnifiedDeltaPlan): Promise<void> {
  const { seqGroups, countDeltasByContextKey, entityStamps: _stamps } = plan;

  const handledContextKeys = new Set<string>();
  const allEntityStamps: Array<{ tableName: string; id: string; seq: number }> = [];

  // Phase 1: Sequential UPSERT per seq group (need RETURNING for each)
  for (const group of seqGroups) {
    // Merge seq deltas with any count deltas for this contextKey
    const mergedDeltas = sumInto({ [group.seqKey]: group.count }, countDeltasByContextKey.get(group.contextKey));
    handledContextKeys.add(group.contextKey);

    const counts = await mergedUpsert(group.contextKey, mergedDeltas, true);
    const highSeq = counts[group.seqKey] ?? group.count;
    const baseSeq = highSeq - group.count;

    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const entityId = group.events[i].result.rowData.id;
      group.events[i].result.rowData.seq = seq;
      allEntityStamps.push({ tableName: group.tableName, id: entityId, seq });
    }

    // Org signal: merge with any count deltas for the org
    if (group.orgSignal) {
      const orgMerged = sumInto({ [group.orgSignal.seqKey]: group.orgSignal.count }, countDeltasByContextKey.get(group.orgSignal.orgKey));
      handledContextKeys.add(group.orgSignal.orgKey);
      await mergedUpsert(group.orgSignal.orgKey, orgMerged);
    }

    log.trace('Batch seq stamped', {
      entityType: group.seqKey.replace('s:', ''),
      count: group.count,
      baseSeq: baseSeq + 1,
      highSeq,
    });
  }

  // Phase 2: Remaining count UPSERTs + bulk entity stamp, all in parallel
  const phase2: Promise<void>[] = [];

  for (const [contextKey, deltas] of countDeltasByContextKey) {
    if (handledContextKeys.has(contextKey)) continue;
    phase2.push(mergedUpsert(contextKey, deltas));
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
