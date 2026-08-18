import { and, eq, lt, sql } from 'drizzle-orm';
import { yjsDocumentsTable } from '#/modules/yjs/yjs-db';
import type { DocContext } from '../constants';
import { db, withRlsTx } from './db';

// Per-document reads and writes run inside `withRlsTx` (tenant + user scoped); the crash-orphan sweep runs system-scope on `db` directly.

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

/** Overwrites the stored Y.Doc state on debounced save; `lastEditedBy` attributes a crash-orphaned session persisted by the startup sweep. */
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

/** Inserts the row on first connection with an optional server-side seed; no-ops if it exists, so concurrent connectors must re-load and use the canonical row. */
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

/** Removes the document row after the cleanup grace period following the last disconnect. */
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

/** Rows untouched longer than the cleanup grace: orphans from a relay crash. Cross-tenant by design, so it runs system-scope on `db`; under an RLS-enforcing role it returns no rows. */
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
