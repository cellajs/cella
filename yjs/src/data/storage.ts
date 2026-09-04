import { and, eq, lt, sql } from 'drizzle-orm';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { yjsDocumentsTable } from '#/modules/yjs/yjs-db';
import type { DocContext } from '../constants';
import { db, withRlsTx } from './db';

// Every read and write runs inside `withRlsTx` (tenant + user scoped) and carries the row's
// tenant id as a predicate, so the result is the same with RLS bypassed. `yjs_documents` is
// fail-closed under RLS: a contextless query on the runtime role returns zero rows, silently.

/** `(entity_type, entity_id)` within the document's own tenant. */
const docWhere = ({ entityType, entityId, tenantId }: Pick<DocContext, 'entityType' | 'entityId' | 'tenantId'>) =>
  and(
    eq(yjsDocumentsTable.entityType, entityType),
    eq(yjsDocumentsTable.entityId, entityId),
    eq(yjsDocumentsTable.tenantId, tenantId),
  );

export async function loadState(ctx: DocContext): Promise<Uint8Array | null> {
  return withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    const rows = await tx.select({ state: yjsDocumentsTable.state }).from(yjsDocumentsTable).where(docWhere(ctx));
    if (rows.length === 0) return null;
    return new Uint8Array(rows[0].state);
  });
}

/** Overwrites the stored Y.Doc state on debounced save; `lastEditedBy` attributes a crash-orphaned session persisted by the startup sweep. */
export async function saveState(ctx: DocContext, state: Uint8Array, lastEditedBy: string | null = null): Promise<void> {
  await withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    await tx
      .update(yjsDocumentsTable)
      .set({ state: Buffer.from(state), lastEditedBy, updatedAt: sql`now()` })
      .where(docWhere(ctx));
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
export async function deleteState(ctx: DocContext): Promise<void> {
  await withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.delete(yjsDocumentsTable).where(docWhere(ctx));
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

/** Tenants swept concurrently by the startup sweep; bounds the startup query fan-out on large installs. */
export const SWEEP_TENANT_CONCURRENCY = 4;

async function listStaleDocsForTenant(tenantId: string, olderThanMs: number): Promise<StaleDocRow[]> {
  return withRlsTx(tenantId, '', async (tx) => {
    const rows = await tx
      .select({
        entityType: yjsDocumentsTable.entityType,
        entityId: yjsDocumentsTable.entityId,
        tenantId: yjsDocumentsTable.tenantId,
        organizationId: yjsDocumentsTable.organizationId,
        state: yjsDocumentsTable.state,
        lastEditedBy: yjsDocumentsTable.lastEditedBy,
      })
      .from(yjsDocumentsTable)
      .where(
        and(
          eq(yjsDocumentsTable.tenantId, tenantId),
          lt(yjsDocumentsTable.updatedAt, sql`now() - (${olderThanMs}::bigint * interval '1 millisecond')`),
        ),
      );
    return rows.map((row) => ({ ...row, state: new Uint8Array(row.state) }));
  });
}

/**
 * Rows untouched longer than the cleanup grace: orphans from a relay crash. Cross-tenant by
 * design, so the sweep visits every tenant through its own tenant-scoped transaction, a bounded
 * number at a time; a contextless query on the fail-closed policy returns nothing.
 */
export async function listStaleDocs(olderThanMs: number): Promise<StaleDocRow[]> {
  // `tenants` sits outside RLS, so the runtime role lists it without context.
  const tenantIds = (await db.select({ id: tenantsTable.id }).from(tenantsTable)).map((row) => row.id);
  const stale: StaleDocRow[] = [];
  for (let i = 0; i < tenantIds.length; i += SWEEP_TENANT_CONCURRENCY) {
    const batch = tenantIds.slice(i, i + SWEEP_TENANT_CONCURRENCY);
    const perTenant = await Promise.all(batch.map((tenantId) => listStaleDocsForTenant(tenantId, olderThanMs)));
    for (const rows of perTenant) stale.push(...rows);
  }
  return stale;
}

/** Delete a swept orphan row inside its own tenant scope. */
export async function deleteStaleDoc(doc: Pick<StaleDocRow, 'entityType' | 'entityId' | 'tenantId'>): Promise<void> {
  await withRlsTx(doc.tenantId, '', async (tx) => {
    await tx.delete(yjsDocumentsTable).where(docWhere(doc));
  });
}
