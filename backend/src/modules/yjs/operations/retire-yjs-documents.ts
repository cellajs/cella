import type { ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { notifyYjsLog } from '#/modules/yjs/operations/notify-yjs-log';
import { deleteYjsDocuments, deleteYjsUpdates } from '#/modules/yjs/yjs-queries';

interface RetireYjsDocumentsOpts {
  entityType: ProductEntityType;
  /** The deleted entities whose documents go. */
  entityIds: string[];
}

/**
 * Deletes the collaborative documents of `entityIds`, base and log, and announces each retired document on
 * YJS_LOG_CHANNEL, so a relay that holds a session on it ends the session at once. For deletions: the yjs module's
 * `<type>.deleted` handler runs it in the transaction of the delete, and an app whose delete path dispatches no event
 * calls it itself. The document row goes first: an append holds it under FOR KEY SHARE, so one in flight commits
 * before the log delete, which takes its row too, and a later one finds no row and is refused.
 */
export async function retireYjsDocuments(ctx: DbContext, { entityType, entityIds }: RetireYjsDocumentsOpts): Promise<void> {
  if (entityIds.length === 0) return;
  const retired = await deleteYjsDocuments(ctx, { entityType, entityIds });
  await deleteYjsUpdates(ctx, { entityType, entityIds });
  await notifyYjsLog(ctx, {
    notices: retired.map(({ entityId, tenantId }) => ({ tenantId, entityType, entityId, retired: true as const })),
  });
}
