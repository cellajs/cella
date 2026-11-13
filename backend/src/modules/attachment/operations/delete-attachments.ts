import type { ActorContext } from '#/core/context';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { deleteProductsOp } from '#/modules/entities/operations/delete-products';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/** Soft-deletes the attachments the caller may delete, as {@link deleteProductsOp} does for every product. */
export const deleteAttachmentsOp = (ctx: ActorContext, ids: string[], stx?: Pick<StxBase, 'mutationId' | 'sourceId'>) =>
  deleteProductsOp(ctx, { entityType: 'attachment', table: attachmentsTable, ids, stx });
