import { and, asc, eq, inArray, lt, max, sql, TransactionRollbackError } from 'drizzle-orm';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import type { LogRow, YjsDocumentRead } from '#/modules/yjs/helpers/yjs-log';
import { type AppendResult, appendYjsUpdate } from '#/modules/yjs/operations/append-yjs-update';
import { seedYjsDocument } from '#/modules/yjs/operations/seed-yjs-document';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';
import { findYjsDocument } from '#/modules/yjs/yjs-queries';
import type { DocKey, DocScope } from '../constants';
import { db, type Tx, withRlsTx } from './db';
import { logNotifier } from './log-notifier';

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

export type { AppendResult, LogRow, YjsDocumentRead };

/**
 * The document in one consistent read (`findYjsDocument`): its row under FOR SHARE, so a compaction's base replace on
 * any relay commits before it or waits, then its log, oldest first. Null when no row exists: never seeded, or retired.
 */
export async function loadDocument(doc: DocKey): Promise<YjsDocumentRead | null> {
  return asSystem(doc, (tx) => findYjsDocument({ var: { db: tx } }, { doc }));
}

/**
 * Seeds the document from its entity in one transaction, as the backend's `seedYjsDocument` does for the API's pull:
 * the description read FOR SHARE, converted by `toSeed`, the document row inserted under a new generation unless one
 * exists, and the document read back. Concurrent seeds, on this relay, another or the API, converge on the first. Null,
 * with nothing inserted, when the entity has no live row: it was deleted, and its document must not come back.
 */
export async function seedDocument(scope: DocScope, toSeed: (description: string | null) => Uint8Array): Promise<YjsDocumentRead | null> {
  return asSystem(scope, (tx) => seedYjsDocument({ var: { db: tx } }, { doc: scope, toSeed }));
}

/**
 * Logs a client's update through the log's one way in (`appendYjsUpdate`), under its sender, whom materialize may
 * credit. Durable before the update is broadcast: one insert, so concurrent appends never overwrite each other. The
 * update extends one `generation` and is appended only while that document row exists, held under a key-share lock
 * until the insert commits. The append notifies nothing in its transaction: once it committed, the relay's notifier
 * announces the row to every relay with the others of its batch. `onLogged` gets the row id before the commit, so the
 * session counts the row as relayed before that notice arrives.
 */
export async function appendUpdate(
  scope: DocScope,
  userId: string | null,
  payload: Uint8Array,
  generation: string,
  onLogged?: (id: number) => void,
): Promise<AppendResult> {
  const result = await asSystem(scope, async (tx) => {
    const appended = await appendYjsUpdate({ var: { db: tx } }, { doc: scope, update: payload, userId: userId || null, generation, notify: false });
    if (appended.status === 'appended') onLogged?.(appended.id);
    return appended;
  });
  if (result.status === 'appended') logNotifier.queue(scope, result.id);
  return result;
}

/**
 * The log of the document's `generation`, oldest first, with that document row held under a key-share lock so no
 * retirement deletes it meanwhile. Null when no row of that generation exists: retired, or reseeded since.
 */
export async function readLogOf(doc: DocKey, generation: string): Promise<LogRow[] | null> {
  return asSystem(doc, async (tx) => {
    const [document] = await tx
      .select({ generation: yjsDocumentsTable.generation })
      .from(yjsDocumentsTable)
      .where(and(docWhere(doc), eq(yjsDocumentsTable.generation, generation)))
      .for('key share');
    if (!document) return null;
    const rows = await tx
      .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
      .from(yjsUpdatesTable)
      .where(logWhere(doc))
      .orderBy(asc(yjsUpdatesTable.id));
    return rows.map((row) => ({ ...row, payload: new Uint8Array(row.payload) }));
  });
}

/** How a fold ended: written, the document retired or reseeded since the read, or another compaction took its rows. */
export type FoldResult = 'ok' | 'retired' | 'overlap';

/**
 * Replaces the base state of `generation`, the one the merge was read from, and deletes exactly the log rows merged
 * into it, in one transaction; rows appended meanwhile stay. `retired`, with nothing changed, when the row of that
 * generation is gone. `overlap`, rolled back, when fewer of the rows are left than were merged: another compaction (a
 * second relay during a rollout) folded them meanwhile, and its base holds rows this merge may lack. The document row
 * is locked first, as a retirement locks it, so two folds of one document wait for each other.
 */
export async function compactState(doc: DocKey, merged: Uint8Array, logIds: number[], generation: string): Promise<FoldResult> {
  try {
    return await asSystem(doc, async (tx): Promise<FoldResult> => {
      const updated = await tx
        .update(yjsDocumentsTable)
        .set({ state: Buffer.from(merged), updatedAt: sql`now()` })
        .where(and(docWhere(doc), eq(yjsDocumentsTable.generation, generation)))
        .returning({ entityId: yjsDocumentsTable.entityId });
      if (updated.length === 0) return 'retired';
      if (logIds.length > 0) {
        const deleted = await tx
          .delete(yjsUpdatesTable)
          .where(and(logWhere(doc), inArray(yjsUpdatesTable.id, logIds)))
          .returning({ id: yjsUpdatesTable.id });
        if (deleted.length < logIds.length) tx.rollback();
      }
      return 'ok';
    });
  } catch (err) {
    if (err instanceof TransactionRollbackError) return 'overlap';
    throw err;
  }
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

/** What a live stamp learns: whether the document row exists (a retired document has none), and the newest log row id. */
export interface LiveStamp {
  exists: boolean;
  lastLogId: number | null;
}

/** Stamps the document row live, so no sweep takes it for an orphan, and reads its newest log row. Creates no row. */
export async function touchDoc(doc: DocKey): Promise<LiveStamp> {
  return asSystem(doc, async (tx) => {
    const stamped = await tx
      .update(yjsDocumentsTable)
      .set({ updatedAt: sql`now()` })
      .where(docWhere(doc))
      .returning({ entityId: yjsDocumentsTable.entityId });
    if (stamped.length === 0) return { exists: false, lastLogId: null };
    const [last] = await tx
      .select({ id: max(yjsUpdatesTable.id).mapWith(Number) })
      .from(yjsUpdatesTable)
      .where(logWhere(doc));
    return { exists: true, lastLogId: last?.id ?? null };
  });
}

/** Tenants swept concurrently by the sweep; bounds its query fan-out on large installs. */
const SWEEP_TENANT_CONCURRENCY = 4;

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
 * row every YJS_LIVE_TOUCH_MS), with no younger log row: the log a relay crash left unwritten, or rows posted over HTTP. An idle document with
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
