import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantContext } from '#/db/tenant-context';
import { deleteAttachmentsByIds } from '#/modules/attachment/attachment-queries';
import { splitByPermission } from '#/permissions/split-by-permission';
import { logEvent } from '#/utils/logger';

export async function deleteAttachmentsOp(
  ctx: AuthContext,
  ids: string[],
): Promise<OperationResult<{ data: []; rejectedIds: string[] }>> {
  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'attachment', ids);

  await tenantContext(ctx, (txCtx) => deleteAttachmentsByIds(txCtx, { ids: allowedIds }));

  logEvent(ctx, 'info', 'Attachments deleted', { ids: allowedIds });

  return { success: true, data: { data: [], rejectedIds } };
}
