import type { ActorContext } from '#/core/context';
import { tenantContextIncludingDeleted } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { deleteAttachmentsByIds } from '#/modules/attachment/attachment-queries';
import { splitByPermission } from '#/permissions/split-by-permission';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

export async function deleteAttachmentsOp(
  ctx: ActorContext,
  ids: string[],
): Promise<{ data: []; rejectedIds: string[] }> {
  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'attachment', ids);
  const deletedAt = getIsoDate();
  const deletedBy = ctx.var.actor.id;

  await tenantContextIncludingDeleted(ctx, async (txCtx) => {
    const deleted = await deleteAttachmentsByIds(txCtx, { ids: allowedIds, deletedAt, deletedBy });
    // Inside the transaction: the collaborative documents of the rows go with them.
    await dispatchMutation(txCtx, 'attachment.deleted', { before: deleted });
  });

  log.info('Attachments deleted', { ids: allowedIds });

  return { data: [], rejectedIds };
}
