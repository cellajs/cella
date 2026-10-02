import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import type { LogRow } from '#/modules/yjs/yjs-log';
import type { DocKey, DocScope } from '../constants';
import { db, type Tx, withRlsTx } from './db';

/**
 * Every read and write runs as the system (no user context) under the document's own tenant, the one its entity row
 * states, and carries that tenant id as a predicate, so the result is the same with RLS bypassed. Both tables are
 * fail-closed under RLS: a contextless query on the runtime role returns zero rows, silently.
 */
const asSystem = <T>(doc: DocKey, fn: (tx: Tx) => Promise<T>) => withRlsTx(doc.tenantId, '', fn);

/** `(entity_type, entity_id)` within the document's own tenant. */
const docWhere = ({ entityType, entityId, tenantId }: DocKey) =>
  and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId), eq(yjsDocumentsTable.tenantId, tenantId));

const logWhere = ({ entityType, entityId, tenantId }: DocKey) =>
  and(eq(yjsUpdatesTable.entityType, entityType), eq(yjsUpdatesTable.entityId, entityId), eq(yjsUpdatesTable.tenantId, tenantId));

export type { LogRow };

/** The document row: its compacted base state (empty when seeded from a null description) and the generation of its seed. */
export interface BaseRow {
  state: Uint8Array;
  generation: string;
}

const baseColumns = { state: yjsDocumentsTable.state, generation: yjsDocumentsTable.generation };

const toBaseRow = (row: { state: Buffer; generation: string }): BaseRow => ({ state: new Uint8Array(row.state), generation: row.generation });

/** The document row, or null when none exists: never seeded, or retired since. */
export async function loadBase(doc: DocKey): Promise<BaseRow | null> {
  return asSystem(doc, async (tx) => {
    const rows = await tx.select(baseColumns).from(yjsDocumentsTable).where(docWhere(doc));
    return rows.length === 0 ? null : toBaseRow(rows[0]);
  });
}

/** Inserts the document row with the server-side seed, under a new generation, unless it exists, then returns the row: concurrent connectors converge on one seed. */
export async function ensureDoc(scope: DocScope, seed: Uint8Array | null): Promise<BaseRow> {
  const { entityType, entityId, tenantId, organizationId } = scope;
  return asSystem(scope, async (tx) => {
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
    const rows = await tx.select(baseColumns).from(yjsDocumentsTable).where(docWhere(scope));
    return toBaseRow(rows[0]);
  });
}

/**
 * Durable before the update is broadcast: one insert, so concurrent appends never overwrite each other. `userId` is the
 * sender, whom materialize may credit. The update extends the history of one `generation`: it is appended only while
 * the document row of that generation exists, which it holds under a key-share lock until the insert commits, so a
 * retire that deletes the row waits for it and then deletes the log row too. False when no such row exists: the
 * document was retired or reseeded, and the update belongs to no history the next seed shares.
 */
export async function appendUpdate(scope: DocScope, userId: string, payload: Uint8Array, generation: string): Promise<boolean> {
  const { entityType, entityId, tenantId, organizationId } = scope;
  return asSystem(scope, async (tx) => {
    const [row] = await tx
      .select({ generation: yjsDocumentsTable.generation })
      .from(yjsDocumentsTable)
      .where(and(docWhere(scope), eq(yjsDocumentsTable.generation, generation)))
      .for('key share');
    if (!row) return false;
    await tx
      .insert(yjsUpdatesTable)
      .values({ entityType, entityId, tenantId, organizationId, userId: userId || null, payload: Buffer.from(payload) });
    return true;
  });
}

/** Every uncompacted update for the document, oldest first. */
export async function readLog(doc: DocKey): Promise<LogRow[]> {
  return asSystem(doc, async (tx) => {
    const rows = await tx
      .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
      .from(yjsUpdatesTable)
      .where(logWhere(doc))
      .orderBy(asc(yjsUpdatesTable.id));
    return rows.map((row) => ({ ...row, payload: new Uint8Array(row.payload) }));
  });
}

/**
 * Replaces the base state of `generation`, the one the merge was read from, and deletes exactly the log rows that were
 * merged into it, in one transaction. Rows appended meanwhile stay. False, with nothing changed, when the row of that
 * generation is gone: the document was retired or reseeded since the read.
 */
export async function compactState(doc: DocKey, merged: Uint8Array, logIds: number[], generation: string): Promise<boolean> {
  return asSystem(doc, async (tx) => {
    const updated = await tx
      .update(yjsDocumentsTable)
      .set({ state: Buffer.from(merged), updatedAt: sql`now()` })
      .where(and(docWhere(doc), eq(yjsDocumentsTable.generation, generation)))
      .returning({ entityId: yjsDocumentsTable.entityId });
    if (updated.length === 0) return false;
    if (logIds.length > 0) {
      await tx.delete(yjsUpdatesTable).where(and(logWhere(doc), inArray(yjsUpdatesTable.id, logIds)));
    }
    return true;
  });
}

/** Deletes log rows no merge accepts, so they never block the document again. */
export async function discardLogRows(doc: DocKey, logIds: number[]): Promise<void> {
  if (logIds.length === 0) return;
  await asSystem(doc, async (tx) => {
    await tx.delete(yjsUpdatesTable).where(and(logWhere(doc), inArray(yjsUpdatesTable.id, logIds)));
  });
}

/**
 * Removes the document row and any log rows: the entity is gone, so nothing can receive them. The row goes first, so an
 * append that holds it commits before the log delete, which takes its row too.
 */
export async function deleteDoc(doc: DocKey): Promise<void> {
  await asSystem(doc, async (tx) => {
    await tx.delete(yjsDocumentsTable).where(docWhere(doc));
    await tx.delete(yjsUpdatesTable).where(logWhere(doc));
  });
}

/** Stamps the document row live, so no startup sweep takes it for an orphan, and reports whether the row exists: a retired document has none. Creates no row. */
export async function touchDoc(doc: DocKey): Promise<boolean> {
  return asSystem(doc, async (tx) => {
    const rows = await tx
      .update(yjsDocumentsTable)
      .set({ updatedAt: sql`now()` })
      .where(docWhere(doc))
      .returning({ entityId: yjsDocumentsTable.entityId });
    return rows.length > 0;
  });
}

/** Tenants swept concurrently by the startup sweep; bounds the startup query fan-out on large installs. */
export const SWEEP_TENANT_CONCURRENCY = 4;

async function listStaleDocsForTenant(tenantId: string, olderThanMs: number): Promise<DocScope[]> {
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
          // An uncompacted log, none of it younger than the grace period: a younger row means the session is live on
          // another relay generation.
          sql`EXISTS (
            SELECT 1 FROM ${yjsUpdatesTable}
            WHERE ${yjsUpdatesTable.entityType} = ${yjsDocumentsTable.entityType}
              AND ${yjsUpdatesTable.entityId} = ${yjsDocumentsTable.entityId}
              AND ${yjsUpdatesTable.tenantId} = ${yjsDocumentsTable.tenantId}
          ) AND NOT EXISTS (
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
 * Documents with an uncompacted log that no session stamped for longer than the cleanup grace (a session stamps its
 * row every YJS_LIVE_TOUCH_MS), with no younger log row: the log a relay crash left unwritten. An idle document with
 * nothing logged is not listed, its row is at rest. Cross-tenant by design, so the sweep visits every tenant through
 * its own tenant-scoped transaction, a bounded number at a time; a contextless query on the fail-closed policy returns
 * nothing.
 */
export async function listStaleDocs(olderThanMs: number): Promise<DocScope[]> {
  // `tenants` sits outside RLS, so the runtime role lists it without context.
  const tenantIds = (await db.select({ id: tenantsTable.id }).from(tenantsTable)).map((row) => row.id);
  const stale: DocScope[] = [];
  for (let i = 0; i < tenantIds.length; i += SWEEP_TENANT_CONCURRENCY) {
    const batch = tenantIds.slice(i, i + SWEEP_TENANT_CONCURRENCY);
    const perTenant = await Promise.all(batch.map((tenantId) => listStaleDocsForTenant(tenantId, olderThanMs)));
    for (const rows of perTenant) stale.push(...rows);
  }
  return stale;
}
