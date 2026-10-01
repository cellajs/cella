import type { z } from '@hono/zod-openapi';
import type { ActorContext } from '#/core/context';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentUpdateStxBodySchema } from '#/modules/attachment/attachment-schema';
import { withAuditUser } from '#/modules/user/helpers/audit-user';
import { getValidProduct } from '#/permissions/get-valid-product';
import { keywordsFromDocument } from '#/utils/description-document';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type UpdateAttachmentInput = z.infer<typeof attachmentUpdateStxBodySchema>;

/**
 * Also the attachment's Yjs materializer: the relay calls it with `materialized` for a collaborative description.
 * `serverOrigin` stamps the fields with the server clock, for a transaction the server built (the Yjs relay).
 */
export async function updateAttachmentOp(
  ctx: ActorContext,
  id: string,
  input: UpdateAttachmentInput,
  opts: { serverOrigin?: boolean; materialized?: boolean },
) {
  const { ops: rawOps, stx } = input;
  const { serverOrigin, materialized } = opts;
  const actorId = ctx.var.actor.id;

  const updatedAttachmentRecord = await tenantContext(ctx, async (txCtx) => {
    const { entity } = await getValidProduct(txCtx, id, 'attachment', 'update');

    attachmentContract.assertBlockFields(rawOps, entity.organizationId);

    // Server-origin writes carry no client field timestamps, so every changed scalar gets a fresh server HLC.
    const resolved = serverOrigin
      ? attachmentContract.resolveServerUpdateOps(entity, rawOps)
      : attachmentContract.resolveUpdateOps(entity, rawOps, stx);

    const values = {
      ...(resolved.changed ? resolved.values : {}),
      // A changed document re-derives the search column, on client edits and Yjs materializations alike.
      ...(resolved.changed && resolved.values.description !== undefined
        ? { keywords: keywordsFromDocument(resolved.values.description as string | null) }
        : {}),
      updatedAt: getIsoDate(),
      updatedBy: actorId,
      ...(resolved.changed ? { stx: resolved.stx } : {}),
    };
    const updated = await updateAttachment(txCtx, { id, values });
    // Inside the transaction, `before`/`after` index-aligned as the mutation bus contract requires.
    await dispatchMutation(txCtx, 'attachment.updated', { before: [entity], after: [updated], materialized });
    return updated;
  });

  log.info('Attachment updated', { attachmentId: updatedAttachmentRecord.id });

  // Resolved by id for every response shape: the context carries an actor id, not a user row to stub from.
  return withAuditUser(ctx, updatedAttachmentRecord);
}
