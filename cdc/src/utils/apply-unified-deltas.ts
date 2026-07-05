import { sql } from 'drizzle-orm';
import format from 'pg-format';
import { cdcDb } from '../lib/db';
import { log } from '../lib/pino';
import type { BatchUnifiedDeltaPlan, UnifiedDeltaPlan } from './compute-unified-deltas';

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

// ── Entity seq stamp ─────────────────────────────────────────────────────────

/**
 * UPDATE a single entity's seq column.
 * Also strips stx.changedFields — it's transient metadata from the last user mutation
 * and would cause handleUpdate to create a spurious activity from stale fields.
 */
async function updateEntitySeq(tableName: string, entityId: string, newSeq: number): Promise<void> {
  await cdcDb.execute(
    sql`UPDATE ${sql.raw(format('%I', tableName))} SET seq = ${newSeq}, stx = stx - 'changedFields' WHERE id = ${entityId}`,
  );
}

// ── Single event execution ───────────────────────────────────────────────────

/**
 * Apply a unified delta plan for a single CDC event.
 *
 * Phase 1 (sequential): UPSERT the seqContextKey row with RETURNING to get the new seq.
 * Phase 2 (parallel): All remaining context UPSERTs + entity seq UPDATE.
 *
 * Returns the new seq value (or undefined if no seq stamp was needed).
 */
export async function applyUnifiedDeltas(plan: UnifiedDeltaPlan): Promise<number | undefined> {
  const { seqContextKey, seqKey, entityStamp, deltasByContextKey } = plan;

  if (deltasByContextKey.size === 0 && !entityStamp) return undefined;

  let newSeq: number | undefined;

  // Phase 1: UPSERT the seq row with RETURNING
  if (seqContextKey && seqKey) {
    const seqDeltas = deltasByContextKey.get(seqContextKey);
    if (seqDeltas) {
      const counts = await mergedUpsert(seqContextKey, seqDeltas, true);
      newSeq = counts[seqKey] ?? undefined;
    }
  }

  // Phase 2: All remaining UPSERTs + entity seq stamp in parallel
  const phase2: Promise<void>[] = [];

  for (const [contextKey, deltas] of deltasByContextKey) {
    if (contextKey === seqContextKey) continue; // Already handled in Phase 1
    phase2.push(mergedUpsert(contextKey, deltas));
  }

  if (entityStamp && newSeq !== undefined) {
    phase2.push(updateEntitySeq(entityStamp.tableName, entityStamp.entityId, newSeq));
  }

  if (phase2.length > 0) {
    await Promise.all(phase2);
  }

  return newSeq;
}

// ── Batch execution ──────────────────────────────────────────────────────────

/**
 * Apply a unified delta plan for a batch of CDC events.
 *
 * 1. For each seq group: UPSERT with RETURNING to reserve a seq range,
 *    merge count deltas for that contextKey, assign seq values to entities.
 * 2. Parallel: all remaining count UPSERTs + bulk entity seq UPDATE.
 *
 * Mutates event.result.rowData.seq for each stampable event.
 */
export async function applyBatchUnifiedDeltas(plan: BatchUnifiedDeltaPlan): Promise<void> {
  const { seqGroups, countDeltasByContextKey, entityStamps: _stamps } = plan;

  // Track which contextKeys have been handled by seq groups
  const handledContextKeys = new Set<string>();
  const allEntityStamps: Array<{ tableName: string; id: string; seq: number }> = [];

  // Phase 1: Sequential UPSERT per seq group (need RETURNING for each)
  for (const group of seqGroups) {
    // Merge seq deltas with any count deltas for this contextKey
    const mergedDeltas: Record<string, number> = { [group.seqKey]: group.count };
    const countDeltas = countDeltasByContextKey.get(group.contextKey);
    if (countDeltas) {
      for (const [k, v] of Object.entries(countDeltas)) {
        mergedDeltas[k] = (mergedDeltas[k] ?? 0) + v;
      }
    }
    handledContextKeys.add(group.contextKey);

    const counts = await mergedUpsert(group.contextKey, mergedDeltas, true);
    const highSeq = counts[group.seqKey] ?? group.count;
    const baseSeq = highSeq - group.count;

    // Assign seq values to events
    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const entityId = group.events[i].result.rowData.id;
      group.events[i].result.rowData.seq = seq;
      allEntityStamps.push({ tableName: group.tableName, id: entityId, seq });
    }

    // Org signal: merge with any count deltas for the org
    if (group.orgSignal) {
      const orgMerged: Record<string, number> = { [group.orgSignal.seqKey]: group.orgSignal.count };
      const orgCounts = countDeltasByContextKey.get(group.orgSignal.orgKey);
      if (orgCounts) {
        for (const [k, v] of Object.entries(orgCounts)) {
          orgMerged[k] = (orgMerged[k] ?? 0) + v;
        }
      }
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

// ── Catchup-mode: seq-only batch execution ───────────────────────────────────

/**
 * Apply only seq stamps from a batch plan, skipping all counter UPSERTs.
 * Used during catchup mode where counters will be recalculated after replay.
 *
 * For each seq group: UPSERT seq delta with RETURNING, assign seq values,
 * then bulk UPDATE entity rows. Org signals are included since they carry
 * seq counters too.
 */
export async function applyBatchSeqOnlyDeltas(plan: BatchUnifiedDeltaPlan): Promise<void> {
  const { seqGroups } = plan;

  if (seqGroups.length === 0) return;

  const allEntityStamps: Array<{ tableName: string; id: string; seq: number }> = [];

  // Phase 1: Sequential UPSERT per seq group (need RETURNING for each)
  for (const group of seqGroups) {
    // Only the seq delta — no count deltas merged
    const seqDelta: Record<string, number> = { [group.seqKey]: group.count };

    const counts = await mergedUpsert(group.contextKey, seqDelta, true);
    const highSeq = counts[group.seqKey] ?? group.count;
    const baseSeq = highSeq - group.count;

    // Assign seq values to events
    for (let i = 0; i < group.events.length; i++) {
      const seq = baseSeq + i + 1;
      const entityId = group.events[i].result.rowData.id;
      group.events[i].result.rowData.seq = seq;
      allEntityStamps.push({ tableName: group.tableName, id: entityId, seq });
    }

    // Org-level seq signal (needed for frontend sync protocol)
    if (group.orgSignal) {
      const orgSeqDelta: Record<string, number> = { [group.orgSignal.seqKey]: group.orgSignal.count };
      await mergedUpsert(group.orgSignal.orgKey, orgSeqDelta);
    }

    log.trace('Catchup seq stamped', {
      entityType: group.seqKey.replace('s:', ''),
      count: group.count,
      baseSeq: baseSeq + 1,
      highSeq,
    });
  }

  // Phase 2: Bulk entity seq stamp
  if (allEntityStamps.length > 0) {
    const byTable = new Map<string, Array<{ id: string; seq: number }>>();
    for (const stamp of allEntityStamps) {
      const list = byTable.get(stamp.tableName);
      if (list) list.push(stamp);
      else byTable.set(stamp.tableName, [stamp]);
    }

    const stampPromises: Promise<void>[] = [];
    for (const [tableName, stamps] of byTable) {
      const valuesList = stamps.map((s) => sql`(${s.id}::uuid, ${s.seq}::bigint)`);
      stampPromises.push(
        cdcDb.execute(sql`
          UPDATE ${sql.raw(format('%I', tableName))} AS t
          SET seq = v.seq, stx = t.stx - 'changedFields'
          FROM (VALUES ${sql.join(valuesList, sql`, `)}) AS v(id, seq)
          WHERE t.id = v.id
        `).then(() => {}),
      );
    }

    await Promise.all(stampPromises);
  }
}
