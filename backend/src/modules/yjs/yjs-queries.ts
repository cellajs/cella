import { and, eq, inArray } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';

interface YjsDocumentsOpts {
  entityType: ProductEntityType;
  /** The entities whose documents go. */
  entityIds: string[];
}

/** Deletes the document rows of these entities. */
export const deleteYjsDocuments = async (ctx: DbContext, { entityType, entityIds }: YjsDocumentsOpts) => {
  await ctx.var.db.delete(yjsDocumentsTable).where(and(eq(yjsDocumentsTable.entityType, entityType), inArray(yjsDocumentsTable.entityId, entityIds)));
};

/** Deletes the update log of these entities' documents. */
export const deleteYjsUpdates = async (ctx: DbContext, { entityType, entityIds }: YjsDocumentsOpts) => {
  await ctx.var.db.delete(yjsUpdatesTable).where(and(eq(yjsUpdatesTable.entityType, entityType), inArray(yjsUpdatesTable.entityId, entityIds)));
};
