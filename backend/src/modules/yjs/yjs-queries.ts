import { and, asc, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
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
