import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { appConfig, type ProductEntityType, toTableName } from 'shared';
import type { DbContext } from '#/core/context';
import type { YjsDocKey, YjsDocScope, YjsDocumentRead } from '#/modules/yjs/helpers/yjs-log';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';

// No `#/env` import and no pool: the Yjs relay imports this file, and passes its own transaction as `ctx.var.db`.

/** `(entity_type, entity_id)` within the document's own tenant, so a read is the same with RLS bypassed. */
const docWhere = ({ entityType, entityId, tenantId }: YjsDocKey) =>
  and(eq(yjsDocumentsTable.entityType, entityType), eq(yjsDocumentsTable.entityId, entityId), eq(yjsDocumentsTable.tenantId, tenantId));

const logWhere = ({ entityType, entityId, tenantId }: YjsDocKey) =>
  and(eq(yjsUpdatesTable.entityType, entityType), eq(yjsUpdatesTable.entityId, entityId), eq(yjsUpdatesTable.tenantId, tenantId));

interface FindYjsDocumentOpts {
  doc: YjsDocKey;
}

/**
 * The document row under FOR SHARE, then its log, oldest first; null when no row exists (never seeded, or retired).
 * The lock makes base and log one read: a compaction's base replace (an UPDATE of the row) commits before it or waits
 * for the caller's transaction, so the log never lacks rows folded into a base the read did not see. Appends hold the
 * row FOR KEY SHARE and do not wait. Runs in the caller's transaction, which carries the document's tenant context:
 * both tables are fail-closed under RLS, and a read without it finds no row.
 */
export const findYjsDocument = async (ctx: DbContext, { doc }: FindYjsDocumentOpts): Promise<YjsDocumentRead | null> => {
  const { db } = ctx.var;
  const [document] = await db
    .select({ state: yjsDocumentsTable.state, generation: yjsDocumentsTable.generation })
    .from(yjsDocumentsTable)
    .where(docWhere(doc))
    .for('share');
  if (!document) return null;
  const rows = await db
    .select({ id: yjsUpdatesTable.id, payload: yjsUpdatesTable.payload, userId: yjsUpdatesTable.userId })
    .from(yjsUpdatesTable)
    .where(logWhere(doc))
    .orderBy(asc(yjsUpdatesTable.id));
  return {
    generation: document.generation,
    base: new Uint8Array(document.state),
    rows: rows.map((row) => ({ ...row, payload: new Uint8Array(row.payload) })),
  };
};

interface InsertYjsDocumentOpts {
  doc: YjsDocScope;
  /** The seed: the base state of a new generation. */
  state: Uint8Array;
}

/**
 * Inserts the document row under a new generation, stamped live, unless a row exists: concurrent seeds, on any relay
 * or the API, converge on the first, and a later one waits for an uncommitted first and then inserts nothing.
 */
export const insertYjsDocument = async (ctx: DbContext, { doc, state }: InsertYjsDocumentOpts) => {
  const { entityType, entityId, tenantId, organizationId } = doc;
  await ctx.var.db
    .insert(yjsDocumentsTable)
    .values({ entityType, entityId, tenantId, organizationId, state: Buffer.from(state), updatedAt: sql`now()` })
    .onConflictDoNothing({ target: [yjsDocumentsTable.entityType, yjsDocumentsTable.entityId] });
};

interface FindYjsDocumentUnderKeyShareOpts {
  doc: YjsDocKey;
}

/**
 * The document row's generation, the row held FOR KEY SHARE until the caller's transaction ends: a retirement, which
 * deletes the row, waits for it, and a read's FOR SHARE lets it through. Undefined when no row exists.
 */
export const findYjsDocumentUnderKeyShare = async (ctx: DbContext, { doc }: FindYjsDocumentUnderKeyShareOpts) => {
  const [document] = await ctx.var.db
    .select({ generation: yjsDocumentsTable.generation })
    .from(yjsDocumentsTable)
    .where(docWhere(doc))
    .for('key share');
  return document;
};

interface InsertYjsUpdateOpts {
  doc: YjsDocScope;
  /** The sender, or null for a server-origin row. */
  userId: string | null;
  payload: Uint8Array;
}

/** Inserts one row into the document's log; returns its id. */
export const insertYjsUpdate = async (ctx: DbContext, { doc, userId, payload }: InsertYjsUpdateOpts) => {
  const { entityType, entityId, tenantId, organizationId } = doc;
  const [row] = await ctx.var.db
    .insert(yjsUpdatesTable)
    .values({ entityType, entityId, tenantId, organizationId, userId, payload: Buffer.from(payload) })
    .returning({ id: yjsUpdatesTable.id });
  return row;
};

interface FindServerYjsUpdateOpts {
  doc: YjsDocKey;
  /** Rows to pass over: the ones a merge already holds. */
  exceptIds: readonly number[];
}

/** One server-origin row (no sender) of the document's log outside `exceptIds`; undefined when there is none. */
export const findServerYjsUpdate = async (ctx: DbContext, { doc, exceptIds }: FindServerYjsUpdateOpts) => {
  const [row] = await ctx.var.db
    .select({ id: yjsUpdatesTable.id })
    .from(yjsUpdatesTable)
    .where(and(logWhere(doc), isNull(yjsUpdatesTable.userId), exceptIds.length > 0 ? notInArray(yjsUpdatesTable.id, [...exceptIds]) : undefined))
    .limit(1);
  return row;
};

interface DeleteYjsDocumentsOpts {
  entityType: ProductEntityType;
  /** The entities whose documents go. */
  entityIds: string[];
}

/** Deletes the document rows of these entities; returns the entity and tenant of each row deleted. */
export const deleteYjsDocuments = async (ctx: DbContext, { entityType, entityIds }: DeleteYjsDocumentsOpts) => {
  return ctx.var.db
    .delete(yjsDocumentsTable)
    .where(and(eq(yjsDocumentsTable.entityType, entityType), inArray(yjsDocumentsTable.entityId, entityIds)))
    .returning({ entityId: yjsDocumentsTable.entityId, tenantId: yjsDocumentsTable.tenantId });
};

interface DeleteYjsUpdatesOpts {
  entityType: ProductEntityType;
  /** The entities whose logs go. */
  entityIds: string[];
}

/** Deletes the update log of these entities' documents. */
export const deleteYjsUpdates = async (ctx: DbContext, { entityType, entityIds }: DeleteYjsUpdatesOpts) => {
  await ctx.var.db.delete(yjsUpdatesTable).where(and(eq(yjsUpdatesTable.entityType, entityType), inArray(yjsUpdatesTable.entityId, entityIds)));
};

/** Column names per table, read once from Postgres and cached per process, so a dynamic read selects only columns a table has. */
const tableColumnsCache = new Map<string, Promise<Set<string>>>();

interface GetTableColumnNamesOpts {
  /** The table, by its database name. */
  table: string;
}

/**
 * The columns of an app-declared table, from `information_schema`, for a read of an entity row by its table name: the
 * relay imports no app-owned entity schema. A failed read is not cached.
 */
export const getTableColumnNames = (ctx: DbContext, { table }: GetTableColumnNamesOpts): Promise<Set<string>> => {
  let cached = tableColumnsCache.get(table);
  if (!cached) {
    cached = ctx.var.db
      .execute<{ column_name: string }>(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table}`,
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((err) => {
        tableColumnsCache.delete(table);
        throw err;
      });
    tableColumnsCache.set(table, cached);
  }
  return cached;
};

interface FindEntityDescriptionForShareOpts {
  doc: YjsDocScope;
}

/**
 * The entity's stored description, read FOR SHARE in the caller's transaction: an outside write's UPDATE of the row
 * waits until the caller commits, and a write in flight commits first and is read. Null when no live row exists in the
 * document's tenant (deleted, or never there). By convention the Yjs-edited column is `description`: a table without
 * it locks its row and gives none, and an entity type the app does not declare has no row to lock. The app-owned table
 * is queried by name, after access to the entity was verified; the tenant and live-row predicates repeat what RLS
 * applies, so the read is the same on a connection that bypasses it.
 */
export const findEntityDescriptionForShare = async (ctx: DbContext, { doc }: FindEntityDescriptionForShareOpts) => {
  if (!(appConfig.entityTypes as readonly string[]).includes(doc.entityType)) return { description: null };

  const table = toTableName(doc.entityType);
  const existing = await getTableColumnNames(ctx, { table });
  if (!existing.has('id')) return { description: null };

  const description = existing.has('description') ? sql.raw('"description"') : sql`NULL::text`;
  const inTenant = existing.has('tenant_id') ? sql` AND "tenant_id" = ${doc.tenantId}` : sql``;
  const live = existing.has('deleted_at') ? sql` AND "deleted_at" IS NULL` : sql``;
  const { rows } = await ctx.var.db.execute<{ description: string | null }>(
    sql`SELECT ${description} AS "description" FROM ${sql.raw(`"${table}"`)} WHERE "id" = ${doc.entityId}${inTenant}${live} FOR SHARE`,
  );
  return rows[0] ?? null;
};
