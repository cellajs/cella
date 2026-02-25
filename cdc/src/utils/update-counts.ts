import { sql } from 'drizzle-orm';
import { isProductEntity } from 'shared';
import { contextCountersTable } from '#/db/schema/context-counters';
import { cdcDb } from '../db';
import type { TableRegistryEntry } from '../types';

/**
 * Count delta to apply to contextCountersTable.counts JSONB.
 */
export interface CountDelta {
  /** Context key (orgId or 'public:{type}') — the row to update */
  contextKey: string;
  /** Key-value deltas: e.g. { 'm:admin': 1, 'm:total': 1 } or { 'e:attachment': -1 } */
  deltas: Record<string, number>;
}

/**
 * Determine count deltas from a CDC event.
 *
 * Membership counts (m: prefix):
 *   - membership create → +1 role, +1 total
 *   - membership delete → -1 role, -1 total
 *   - membership update (role change) → -1 old role, +1 new role
 *
 * Inactive membership counts (m:pending):
 *   - create with rejectedAt=null → +1 pending
 *   - delete with rejectedAt=null → -1 pending
 *   - update rejectedAt null→non-null → -1 pending
 *
 * Entity counts (e: prefix):
 *   - product entity create with orgId → +1
 *   - product entity delete with orgId → -1
 */
export function getCountDeltas(
  entry: TableRegistryEntry,
  action: 'create' | 'update' | 'delete',
  newRow: Record<string, unknown>,
  oldRow?: Record<string, unknown>,
): CountDelta | null {
  const orgId = getStringValue(newRow, 'organizationId') ?? getStringValue(oldRow, 'organizationId');
  if (!orgId) return null;

  // Active memberships: track role counts + total
  if (entry.kind === 'resource' && entry.type === 'membership') {
    return getMembershipDelta(action, orgId, newRow, oldRow);
  }

  // Inactive memberships: track pending count
  if (entry.kind === 'resource' && entry.type === 'inactive_membership') {
    return getInactiveMembershipDelta(action, orgId, newRow, oldRow);
  }

  // Product entities: track entity type counts
  if (entry.kind === 'entity' && isProductEntity(entry.type)) {
    return getEntityDelta(action, orgId, entry.type);
  }

  return null;
}

/**
 * Apply count deltas to contextCountersTable.counts JSONB.
 * Uses atomic upsert with per-key increment, floored at 0.
 */
export async function updateContextCounts(delta: CountDelta): Promise<void> {
  const entries = Object.entries(delta.deltas);
  if (entries.length === 0) return;

  // Build initial counts for INSERT (apply deltas from 0, floor at 0)
  const initialCounts: Record<string, number> = {};
  for (const [key, value] of entries) {
    initialCounts[key] = Math.max(0, value);
  }

  // Build the SET expression for ON CONFLICT: chain jsonb || for each key
  // Each key: jsonb_build_object('key', GREATEST(0, COALESCE((counts->>'key')::int, 0) + delta))
  // Note: We use sql.raw() for literal key strings and explicit ::int cast for the delta
  // because PGlite cannot infer parameter types inside jsonb_build_object / GREATEST / COALESCE.
  const setClauses = entries.map(([key, value]) => {
    const safeKey = key.replace(/'/g, "''");
    return sql`jsonb_build_object(${sql.raw(`'${safeKey}'`)}, GREATEST(0, COALESCE((${contextCountersTable.counts}->>${sql.raw(`'${safeKey}'`)})::int, 0) + ${value}::int))`;
  });

  // Chain with || operator: counts || obj1 || obj2 || ...
  let countsExpr = sql`${contextCountersTable.counts}`;
  for (const clause of setClauses) {
    countsExpr = sql`${countsExpr} || ${clause}`;
  }

  await cdcDb
    .insert(contextCountersTable)
    .values({
      contextKey: delta.contextKey,
      seq: 0,
      mSeq: 0,
      counts: initialCounts,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: contextCountersTable.contextKey,
      set: {
        counts: countsExpr,
        updatedAt: new Date(),
      },
    });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getStringValue(row: Record<string, unknown> | undefined, key: string): string | null {
  if (!row) return null;
  const v = row[key];
  return typeof v === 'string' ? v : null;
}

function getMembershipDelta(
  action: 'create' | 'update' | 'delete',
  orgId: string,
  newRow: Record<string, unknown>,
  oldRow?: Record<string, unknown>,
): CountDelta | null {
  if (action === 'create') {
    const role = getStringValue(newRow, 'role');
    if (!role) return null;
    return { contextKey: orgId, deltas: { [`m:${role}`]: 1, 'm:total': 1 } };
  }

  if (action === 'delete') {
    // For DELETE, row data comes from old row (REPLICA IDENTITY FULL)
    const role = getStringValue(newRow, 'role') ?? getStringValue(oldRow, 'role');
    if (!role) return null;
    return { contextKey: orgId, deltas: { [`m:${role}`]: -1, 'm:total': -1 } };
  }

  if (action === 'update' && oldRow) {
    const oldRole = getStringValue(oldRow, 'role');
    const newRole = getStringValue(newRow, 'role');
    // Only emit delta if role actually changed
    if (oldRole && newRole && oldRole !== newRole) {
      return { contextKey: orgId, deltas: { [`m:${oldRole}`]: -1, [`m:${newRole}`]: 1 } };
    }
  }

  return null;
}

function getInactiveMembershipDelta(
  action: 'create' | 'update' | 'delete',
  orgId: string,
  newRow: Record<string, unknown>,
  oldRow?: Record<string, unknown>,
): CountDelta | null {
  if (action === 'create') {
    // Only count pending (not rejected)
    if (newRow.rejectedAt != null) return null;
    return { contextKey: orgId, deltas: { 'm:pending': 1 } };
  }

  if (action === 'delete') {
    // Only decrement if it was pending (rejectedAt was null)
    const rejectedAt = newRow.rejectedAt ?? oldRow?.rejectedAt;
    if (rejectedAt != null) return null;
    return { contextKey: orgId, deltas: { 'm:pending': -1 } };
  }

  if (action === 'update' && oldRow) {
    const wasNull = oldRow.rejectedAt == null;
    const isNull = newRow.rejectedAt == null;
    // Transition from pending to rejected
    if (wasNull && !isNull) {
      return { contextKey: orgId, deltas: { 'm:pending': -1 } };
    }
    // Transition from rejected to pending (unlikely but handle it)
    if (!wasNull && isNull) {
      return { contextKey: orgId, deltas: { 'm:pending': 1 } };
    }
  }

  return null;
}

function getEntityDelta(
  action: 'create' | 'update' | 'delete',
  orgId: string,
  entityType: string,
): CountDelta | null {
  if (action === 'create') {
    return { contextKey: orgId, deltas: { [`e:${entityType}`]: 1 } };
  }
  if (action === 'delete') {
    return { contextKey: orgId, deltas: { [`e:${entityType}`]: -1 } };
  }
  // Updates don't change entity counts
  return null;
}
