import type { ActorContext } from '#/core/context';
import { tenantContextIncludingDeleted } from '#/db/tenant-context';
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
  const deletedBy = ctx.var.principalId;

  await tenantContextIncludingDeleted(ctx, (txCtx) =>
    deleteAttachmentsByIds(txCtx, { ids: allowedIds, deletedAt, deletedBy }),
  );

  log.info('Attachments deleted', { ids: allowedIds });

  return { data: [], rejectedIds };
}
