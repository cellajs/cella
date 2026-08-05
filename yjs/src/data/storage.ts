import { and, eq, lt, sql } from 'drizzle-orm';
import { yjsDocumentsTable } from '#/modules/yjs/yjs-db';
import type { DocContext } from '../constants';
import { db, withRlsTx } from './db';

// Access split: per-document reads/writes run inside `withRlsTx` (tenant + user scoped),
// while the crash-orphan sweep queries run system-scope on `db` directly (cross-tenant).

/**
 * Returns raw Y.Doc binary state from PG, or null if no document exists yet.
 */
export async function loadState({ entityType, entityId, tenantId, userId }: DocContext): Promise<Uint8Array | null> {
  return withRlsTx(tenantId, userId, async (tx) => {
    const rows = await tx
      .select({ state: yjsDocumentsTable.state })
      .from(yjsDocumentsTable)
      .where(and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId)));
    if (rows.length === 0) return null;
    return new Uint8Array(rows[0].state);
  });
}

/**
 * Overwrites the stored Y.Doc state. Called on debounced save from the relay.
 * `lastEditedBy` identifies the user supplied when the startup sweep persists a
 * crash-orphaned session into the durable entity record.
 */
export async function saveState(
  { entityType, entityId, tenantId, userId }: DocContext,
  state: Uint8Array,
  lastEditedBy: string | null = null,
): Promise<void> {
  await withRlsTx(tenantId, userId, async (tx) => {
    await tx
      .update(yjsDocumentsTable)
      .set({ state: Buffer.from(state), lastEditedBy, updatedAt: sql`now()` })
      .where(and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId)));
  });
}

/**
 * Inserts a document row on first connection, optionally with a server-side seed
 * as its initial state. No-ops if it already exists: concurrent connectors must
 * re-load afterwards and use the canonical row (two independently generated seeds
 * would duplicate content when merged).
 */
export async function createDoc(
  { entityType, entityId, tenantId, userId, organizationId }: DocContext,
  initialState?: Uint8Array | null,
): Promise<void> {
  await withRlsTx(tenantId, userId, async (tx) => {
    await tx
      .insert(yjsDocumentsTable)
      .values({
        entityType,
        entityId,
        tenantId,
        organizationId,
        state: initialState ? Buffer.from(initialState) : Buffer.alloc(0),
        updatedAt: sql`now()`,
      })
      .onConflictDoNothing({ target: [yjsDocumentsTable.entityType, yjsDocumentsTable.entityId] });
  });
}

/**
 * Removes the document row after the cleanup grace period (all clients disconnected).
 */
export async function deleteState({ entityType, entityId, tenantId, userId }: DocContext): Promise<void> {
  await withRlsTx(tenantId, userId, async (tx) => {
    await tx
      .delete(yjsDocumentsTable)
      .where(and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId)));
  });
}

export interface StaleDocRow {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
  state: Uint8Array;
  lastEditedBy: string | null;
}

/**
 * List document rows untouched for longer than the cleanup grace: orphans left by a
 * relay crash between last-disconnect and cleanup. Cross-tenant by design, so this runs
 * system-scope on `db` directly (no tenant context). If the DB role enforces RLS it returns
 * no rows and the sweep degrades to a no-op, and normal gated cleanup is unaffected.
 */
export async function listStaleDocs(olderThanMs: number): Promise<StaleDocRow[]> {
  const rows = await db
    .select({
      entityType: yjsDocumentsTable.entityType,
      entityId: yjsDocumentsTable.entityId,
      tenantId: yjsDocumentsTable.tenantId,
      organizationId: yjsDocumentsTable.organizationId,
      state: yjsDocumentsTable.state,
      lastEditedBy: yjsDocumentsTable.lastEditedBy,
    })
    .from(yjsDocumentsTable)
    .where(lt(yjsDocumentsTable.updatedAt, sql`now() - (${olderThanMs}::bigint * interval '1 millisecond')`));
  return rows.map((row) => ({
    entityType: row.entityType,
    entityId: row.entityId,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    state: new Uint8Array(row.state),
    lastEditedBy: row.lastEditedBy,
  }));
}

/** Delete a swept orphan row (system-scope on `db`, same cross-tenant caveat as {@link listStaleDocs}). */
export async function deleteStaleDoc(entityType: string, entityId: string): Promise<void> {
  await db
    .delete(yjsDocumentsTable)
    .where(and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId)));
}
