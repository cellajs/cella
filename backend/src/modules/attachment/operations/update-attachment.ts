import type { z } from '@hono/zod-openapi';
import { deriveDocument } from 'shared/utils/derive-description-core';
import type { ActorContext } from '#/core/context';
import { assertNoWriteBetween, assertPreconditionsChecked } from '#/core/preconditions';
import { tenantContext } from '#/db/tenant-context';
import { updateStamps } from '#/db/utils/stamps';
import { dispatchMutation } from '#/lib/mutation-bus';
import { withActorRef, withActorRefs } from '#/modules/actors/actor-refs';
import type { AttachmentModel } from '#/modules/attachment/attachment-db';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import { type attachmentBatchUpdateBodySchema, attachmentContract, type attachmentUpdateStxBodySchema } from '#/modules/attachment/attachment-schema';
import { updateProductsOp } from '#/modules/entities/operations/update-products';
import { getValidProduct } from '#/permissions/get-valid-product';
import { log } from '#/utils/logger';

type UpdateAttachmentInput = z.infer<typeof attachmentUpdateStxBodySchema>;

/**
 * Writes one attachment's update in the caller's transaction, to a row read locked and checked: the row writer of the
 * single update and the batch.
 * @returns The row as stored after the write and the fields it accepted; null when it accepts none and writes nothing.
 * @throws AppError 400 for a description with media outside the organization; 412 when a write landed after the
 * precondition check.
 */
async function writeAttachmentUpdate(
  txCtx: ActorContext,
  entity: AttachmentModel,
  { ops: rawOps, stx }: UpdateAttachmentInput,
): Promise<{ updated: AttachmentModel; changedFields: string[] } | null> {
  attachmentContract.assertBlockFields(rawOps, entity.organizationId);

  const resolved = attachmentContract.resolveUpdateOps(entity, rawOps, stx);
  // A write that accepts no field leaves the row as stored: no stamps, no change for the CDC worker.
  if (!resolved.changed) return null;

  const values = {
    ...resolved.values,
    stx: resolved.stx,
    // A changed document re-derives the search column, on client edits and Yjs materializations alike.
    ...(resolved.values.description !== undefined ? { keywords: deriveDocument(resolved.values.description).keywords } : {}),
    ...updateStamps(txCtx.var.actor.id),
  };
  const updated = await updateAttachment(txCtx, { id: entity.id, values });
  if (!updated) assertNoWriteBetween(txCtx, 'attachment', entity.id);
  return { updated, changedFields: resolved.acceptedFieldNames };
}

/** Also the attachment's Yjs materializer: `materializeDescriptionOp` calls it for a collaborative description the relay posts. */
export async function updateAttachmentOp(ctx: ActorContext, id: string, input: UpdateAttachmentInput) {
  const { attachment, written } = await tenantContext(ctx, async (txCtx) => {
    // Locked: the merge below starts from this row, so no other write may commit between the read and the update.
    const { entity } = await getValidProduct(txCtx, id, 'attachment', 'update', { forUpdate: true });

    const write = await writeAttachmentUpdate(txCtx, entity, input);
    if (!write) {
      assertPreconditionsChecked(txCtx, 'attachment');
      return { attachment: entity, written: false };
    }

    // Inside the transaction, `before`/`after` index-aligned as the mutation bus contract requires, with the fields
    // this write wrote for the yjs module.
    await dispatchMutation(txCtx, 'attachment.updated', { before: [entity], after: [write.updated], changedFields: [write.changedFields] });
    return { attachment: write.updated, written: true };
  });

  if (written) log.info('Attachment updated', { attachmentId: attachment.id });

  // Writers resolved by id: the context carries an actor id, not a user row to stub from.
  return withActorRef(ctx, attachment);
}

/** Updates the attachments of a batch the caller may update, each as {@link updateAttachmentOp} writes it. */
export async function batchUpdateAttachmentsOp(ctx: ActorContext, items: z.infer<typeof attachmentBatchUpdateBodySchema>) {
  const { results, rejectedIds } = await updateProductsOp(ctx, { entityType: 'attachment', items, writeRow: writeAttachmentUpdate });
  return { results: await withActorRefs(ctx, results), rejectedIds };
}
