import type { z } from '@hono/zod-openapi';
import { deriveDocument } from 'shared/utils/derive-description-core';
import type { ActorContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { updateStamps } from '#/db/utils/stamps';
import { dispatchMutation } from '#/lib/mutation-bus';
import { withActorRef } from '#/modules/actors/actor-refs';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentUpdateStxBodySchema } from '#/modules/attachment/attachment-schema';
import { getValidProduct } from '#/permissions/get-valid-product';
import { log } from '#/utils/logger';

type UpdateAttachmentInput = z.infer<typeof attachmentUpdateStxBodySchema>;

/** Also the attachment's Yjs materializer: `materializeDescriptionOp` calls it for a collaborative description the relay posts. */
export async function updateAttachmentOp(ctx: ActorContext, id: string, input: UpdateAttachmentInput) {
  const { ops: rawOps, stx } = input;
  const actorId = ctx.var.actor.id;

  const updatedAttachmentRecord = await tenantContext(ctx, async (txCtx) => {
    // Locked: the merge below starts from this row, so no other write may commit between the read and the update.
    const { entity } = await getValidProduct(txCtx, id, 'attachment', 'update', { forUpdate: true });

    attachmentContract.assertBlockFields(rawOps, entity.organizationId);

    const resolved = attachmentContract.resolveUpdateOps(entity, rawOps, stx);

    const values = {
      // A write that changes no field keeps the stored stx.
      ...(resolved.changed ? { ...resolved.values, stx: resolved.stx } : {}),
      // A changed document re-derives the search column, on client edits and Yjs materializations alike.
      ...(resolved.changed && resolved.values.description !== undefined ? { keywords: deriveDocument(resolved.values.description).keywords } : {}),
      ...updateStamps(actorId),
    };
    const updated = await updateAttachment(txCtx, { id, values });
    // Inside the transaction, `before`/`after` index-aligned as the mutation bus contract requires, with the fields
    // this write wrote for the yjs module.
    await dispatchMutation(txCtx, 'attachment.updated', {
      before: [entity],
      after: [updated],
      ...(resolved.changed && { changedFields: [resolved.acceptedFieldNames] }),
    });
    return updated;
  });

  log.info('Attachment updated', { attachmentId: updatedAttachmentRecord.id });

  // Writers resolved by id: the context carries an actor id, not a user row to stub from.
  return withActorRef(ctx, updatedAttachmentRecord);
}
