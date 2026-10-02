import type { ProductEntityType } from 'shared';
import type { DbOrTx } from '#/db/db';
import { deleteYjsDocuments, deleteYjsUpdates } from '#/modules/yjs/yjs-queries';

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
  const ctx = { var: { db } };
  await deleteYjsDocuments(ctx, { entityType, entityIds: ids });
  await deleteYjsUpdates(ctx, { entityType, entityIds: ids });
}
