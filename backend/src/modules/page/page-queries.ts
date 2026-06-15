import { and, eq, getColumns, inArray, isNull, min, or, type SQL } from 'drizzle-orm';
import type { DbContext } from '#/core/context';
import { pagesTable } from '#/modules/page/page-db';
import { auditUserSelect, createdByUser, updatedByUser } from '#/modules/user/helpers/audit-user';

interface FindPageByIdOpts {
  id: string;
}

/** Find a page by ID. */
export const findPageById = async (ctx: DbContext, { id }: FindPageByIdOpts) => {
  const { db } = ctx.var;
  const [page] = await db.select().from(pagesTable).where(eq(pagesTable.id, id));
  return page;
};

interface FindPagesByStxEntityIdOpts {
  entityId: string;
}

/** Find pages by STX mutation ID (idempotency check). */
export const findPagesByStxEntityId = async (ctx: DbContext, { entityId }: FindPagesByStxEntityIdOpts) => {
  const { db } = ctx.var;
  return db.select().from(pagesTable).where(eq(pagesTable.id, entityId));
};

/** Insert pages in bulk and return the created records. Silently skips duplicates (PK conflict). */
export const insertPages = async (ctx: DbContext, { pages }: { pages: (typeof pagesTable.$inferInsert)[] }) => {
  const { db } = ctx.var;
  return db.insert(pagesTable).values(pages).onConflictDoNothing().returning();
};

interface UpdatePageOpts {
  id: string;
  values: Partial<typeof pagesTable.$inferInsert>;
}

/** Update a page by ID and return the updated record. */
export const updatePage = async (ctx: DbContext, { id, values }: UpdatePageOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(pagesTable).set(values).where(eq(pagesTable.id, id)).returning();
  return updated;
};

interface DeletePagesByIdsOpts {
  ids: string[];
}

/** Delete pages by IDs. */
export const deletePagesByIds = async (ctx: DbContext, { ids }: DeletePagesByIdsOpts) => {
  const { db } = ctx.var;
  return db.delete(pagesTable).where(inArray(pagesTable.id, ids));
};

/** Get the minimum displayOrder for pages, optionally scoped by parentId. */
export const getMinPageDisplayOrder = async (ctx: DbContext, { parentId }: { parentId?: string | null }) => {
  const { db } = ctx.var;
  const filters =
    parentId === undefined ? [] : [parentId ? eq(pagesTable.parentId, parentId) : isNull(pagesTable.parentId)];
  const condition = filters.length ? and(...filters) : undefined;
  const [result] = await db
    .select({ min: min(pagesTable.displayOrder) })
    .from(pagesTable)
    .where(condition);
  return result?.min ?? null;
};

interface BuildPagesListQueryOpts {
  filters: SQL[];
}

/** Build the pages list query with audit user joins. Returns a query that can be ordered/paginated. */
export const buildPagesListQuery = (ctx: DbContext, { filters }: BuildPagesListQueryOpts) => {
  const { db } = ctx.var;
  const { createdBy: _cb, updatedBy: _mb, ...pageCols } = getColumns(pagesTable);

  return db
    .select({ ...pageCols, ...auditUserSelect })
    .from(pagesTable)
    .leftJoin(createdByUser, eq(createdByUser.id, pagesTable.createdBy))
    .leftJoin(updatedByUser, eq(updatedByUser.id, pagesTable.updatedBy))
    .where(and(or(...filters)));
};
