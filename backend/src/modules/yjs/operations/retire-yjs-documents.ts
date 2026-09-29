import { and, eq, inArray } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { DbOrTx } from '#/db/db';
import { yjsDocumentsTable, yjsUpdatesTable } from '#/modules/yjs/yjs-db';

/**
 * Deletes the collaborative documents of `ids`, base and log, so the relay ends any open session on them and seeds
 * the next one from the stored description under a new generation. Runs in the transaction of a write of the
 * description that did not come through the relay, and of the entity's deletion: the yjs module's mutation handlers
 * call it for every product module that dispatches `<type>.updated` and `<type>.deleted`, and an app whose write
 * path dispatches neither calls it itself. The document row goes first: the relay appends to the log only while it
 * holds that row, so an append in flight commits before the log delete, which takes its row too, and a later one finds
 * no row and is refused.
 */
export async function retireYjsDocuments(db: DbOrTx, entityType: ProductEntityType, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .delete(yjsDocumentsTable)
    .where(and(eq(yjsDocumentsTable.entityType, entityType), inArray(yjsDocumentsTable.entityId, ids)));
  await db
    .delete(yjsUpdatesTable)
    .where(and(eq(yjsUpdatesTable.entityType, entityType), inArray(yjsUpdatesTable.entityId, ids)));
}
