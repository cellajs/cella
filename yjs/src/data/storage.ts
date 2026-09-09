import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import type { DocContext } from '../constants';
import { db, withRlsTx } from './db';

// Every read and write runs inside `withRlsTx` (tenant + user scoped) and carries the row's
// tenant id as a predicate, so the result is the same with RLS bypassed. Both tables are
// fail-closed under RLS: a contextless query on the runtime role returns zero rows, silently.

type DocKey = Pick<DocContext, 'entityType' | 'entityId' | 'tenantId'>;

/** `(entity_type, entity_id)` within the document's own tenant. */
const docWhere = ({ entityType, entityId, tenantId }: DocKey) =>
  and(
    eq(yjsDocumentsTable.entityType, entityType),
    eq(yjsDocumentsTable.entityId, entityId),
    eq(yjsDocumentsTable.tenantId, tenantId),
  );

const logWhere = ({ entityType, entityId, tenantId }: DocKey) =>
  and(
    eq(yjsUpdatesTable.entityType, entityType),
    eq(yjsUpdatesTable.entityId, entityId),
    eq(yjsUpdatesTable.tenantId, tenantId),
  );

/** One appended client update, in arrival order. */
export interface LogRow {
  id: number;
  payload: Uint8Array;
  userId: string | null;
}

/** Compacted base state, or null when no session row exists. An empty array is a row seeded from a null description. */
export async function loadBase(ctx: DocContext): Promise<Uint8Array | null> {
  return withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    const rows = await tx.select({ state: yjsDocumentsTable.state }).from(yjsDocumentsTable).where(docWhere(ctx));
    if (rows.length === 0) return null;
    return new Uint8Array(rows[0].state);
  });
}

/** Inserts the session row with the server-side seed unless it exists, then returns the row's state: concurrent connectors converge on one seed. */
export async function ensureDoc(ctx: DocContext, seed: Uint8Array | null): Promise<Uint8Array> {
  const { entityType, entityId, tenantId, userId, organizationId } = ctx;
  return withRlsTx(tenantId, userId, async (tx) => {
    await tx
      .insert(yjsDocumentsTable)
      .values({
        entityType,
        entityId,
        tenantId,
        organizationId,
        state: seed ? Buffer.from(seed) : Buffer.alloc(0),
        updatedAt: sql`now()`,
      })
      .onConflictDoNothing({ target: [yjsDocumentsTable.entityType, yjsDocumentsTable.entityId] });
    const rows = await tx.select({ state: yjsDocumentsTable.state }).from(yjsDocumentsTable).where(docWhere(ctx));
    return new Uint8Array(rows[0]?.state ?? Buffer.alloc(0));
  });
}

/** Durable before the update is broadcast: one insert, no read, so concurrent appends never overwrite each other. */
export async function appendUpdate(ctx: DocContext, payload: Uint8Array): Promise<void> {
  const { entityType, entityId, tenantId, userId, organizationId } = ctx;
  await withRlsTx(tenantId, userId, async (tx) => {
    await tx.insert(yjsUpdatesTable).values({
      entityType,
      entityId,
      tenantId,
      organizationId,
      userId: userId || null,
      payload: Buffer.from(payload),
    });
  });
}

/** Every uncompacted update for the document, oldest first. */
export async function readLog(ctx: DocContext): Promise<LogRow[]> {
  return withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    const rows = await tx
      .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
      .from(yjsUpdatesTable)
      .where(logWhere(ctx))
      .orderBy(asc(yjsUpdatesTable.id));
    return rows.map((row) => ({ ...row, payload: new Uint8Array(row.payload) }));
  });
}

/** Replaces the base state and deletes exactly the log rows that were merged into it, in one transaction. Rows appended meanwhile stay. */
export async function compactState(ctx: DocContext, merged: Uint8Array, logIds: number[]): Promise<void> {
  await withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    await tx
      .update(yjsDocumentsTable)
      .set({ state: Buffer.from(merged), updatedAt: sql`now()` })
      .where(docWhere(ctx));
    if (logIds.length > 0) {
      await tx.delete(yjsUpdatesTable).where(and(logWhere(ctx), inArray(yjsUpdatesTable.id, logIds)));
    }
  });
}

/** Removes the session row and any log rows once the session is over. */
export async function deleteDoc(ctx: DocContext): Promise<void> {
  await withRlsTx(ctx.tenantId, ctx.userId, async (tx) => {
    await tx.delete(yjsUpdatesTable).where(logWhere(ctx));
    await tx.delete(yjsDocumentsTable).where(docWhere(ctx));
  });
}

export interface StaleDocRow {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
}

/** Tenants swept concurrently by the startup sweep; bounds the startup query fan-out on large installs. */
export const SWEEP_TENANT_CONCURRENCY = 4;

async function listStaleDocsForTenant(tenantId: string, olderThanMs: number): Promise<StaleDocRow[]> {
  const cutoff = sql`now() - (${olderThanMs}::bigint * interval '1 millisecond')`;
  return withRlsTx(tenantId, '', async (tx) => {
    return tx
      .select({
        entityType: yjsDocumentsTable.entityType,
        entityId: yjsDocumentsTable.entityId,
        tenantId: yjsDocumentsTable.tenantId,
        organizationId: yjsDocumentsTable.organizationId,
      })
      .from(yjsDocumentsTable)
      .where(
        and(
          eq(yjsDocumentsTable.tenantId, tenantId),
          lt(yjsDocumentsTable.updatedAt, cutoff),
          // A log row younger than the grace period means the session is live on another relay generation.
          sql`NOT EXISTS (
            SELECT 1 FROM ${yjsUpdatesTable}
            WHERE ${yjsUpdatesTable.entityType} = ${yjsDocumentsTable.entityType}
              AND ${yjsUpdatesTable.entityId} = ${yjsDocumentsTable.entityId}
              AND ${yjsUpdatesTable.tenantId} = ${yjsDocumentsTable.tenantId}
              AND ${yjsUpdatesTable.createdAt} >= ${cutoff}
          )`,
        ),
      );
  });
}

/**
 * Session rows untouched longer than the cleanup grace, with no younger log row: orphans from a
 * relay crash. Cross-tenant by design, so the sweep visits every tenant through its own
 * tenant-scoped transaction, a bounded number at a time; a contextless query on the fail-closed
 * policy returns nothing.
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
