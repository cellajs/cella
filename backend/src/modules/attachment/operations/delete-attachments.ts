import type { ActorContext } from '#/core/context';
import { createServerStx } from '#/core/stx/create-server-stx';
import { tenantContextIncludingDeleted } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { deleteAttachmentsByIds } from '#/modules/attachment/attachment-queries';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { splitDeleteByPermission } from '#/utils/idempotency';
import { log } from '#/utils/logger';

/**
 * Soft-deletes the attachments the caller may delete, stamping each row with the delete's `stx`. A delete sent again
 * answers as its first attempt did: the rows that attempt removed count as deleted.
 * @param stx - The ids the client sent with the delete; a server stx when it sent none.
 * @returns The ids the caller may not delete, as `rejectedIds`.
 * @throws AppError 403 when the caller may delete none of them.
 */
export async function deleteAttachmentsOp(
  ctx: ActorContext,
  ids: string[],
  stx: Pick<StxBase, 'mutationId' | 'sourceId'> = createServerStx(),
): Promise<{ data: []; rejectedIds: string[] }> {
  const { allowedIds, rejectedIds } = await splitDeleteByPermission(ctx, attachmentsTable, 'attachment', ids, stx);
  if (!allowedIds.length) return { data: [], rejectedIds };

  await tenantContextIncludingDeleted(ctx, async (txCtx) => {
    const deleted = await deleteAttachmentsByIds(txCtx, { ids: allowedIds, actorId: ctx.var.actor.id, stx });
    // Inside the transaction: the collaborative documents of the rows go with them.
    await dispatchMutation(txCtx, 'attachment.deleted', { before: deleted });
  });

  log.info('Attachments deleted', { ids: allowedIds });

  return { data: [], rejectedIds };
}
