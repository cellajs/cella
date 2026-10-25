import type { z } from '@hono/zod-openapi';
import { hasCloudFile } from 'shared/utils/storage-key';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { tenantContext } from '#/db/tenant-context';
import { updateStamps } from '#/db/utils/stamps';
import { stripChangedFields } from '#/db/utils/strip-changed-fields';
import { dispatchMutation } from '#/lib/mutation-bus';
import { withActorRef } from '#/modules/actors/actor-refs';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import { type AttachmentKeys, attachmentKeysSchema, type attachmentLinkKeysBodySchema } from '#/modules/attachment/attachment-schema';
import { namesUploaderStorage } from '#/modules/attachment/helpers/storage-key';
import { storedFileSize } from '#/modules/attachment/helpers/stored-file';
import { getValidProduct } from '#/permissions/get-valid-product';
import { log } from '#/utils/logger';

type LinkAttachmentKeysInput = z.infer<typeof attachmentLinkKeysBodySchema>;

const sameKeys = (a: AttachmentKeys, b: AttachmentKeys) =>
  attachmentKeysSchema.keyof().options.every((variant) => (a[variant] ?? null) === (b[variant] ?? null));

/**
 * Stores the keys of a file uploaded after its row was created: offline, or before cloud storage was configured. Only
 * the uploader links them, and only once; a row whose file is already stored keeps its keys.
 */
export async function linkAttachmentKeysOp(ctx: ActorContext, id: string, { keys, convertedContentType }: LinkAttachmentKeysInput) {
  const actorId = ctx.var.actor.id;

  const linkedRecord = await tenantContext(ctx, async (txCtx) => {
    const { entity } = await getValidProduct(txCtx, id, 'attachment', 'read', { forUpdate: true });

    // The bytes and the upload token are the uploader's, so no one else can name where they landed.
    if (entity.createdBy !== actorId) throw new AppError(403, 'forbidden', 'warn', { entityType: 'attachment' });

    if (!namesUploaderStorage(keys, entity.organizationId, actorId)) {
      throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'storage_key' } });
    }

    if (hasCloudFile(entity.keys)) {
      // A retry after a lost response finds its own keys stored.
      if (sameKeys(entity.keys, keys)) return entity;
      throw new AppError(409, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'already_stored' } });
    }

    const storedSize = await storedFileSize(keys, entity.bucketName);

    const updated = await updateAttachment(txCtx, {
      id,
      values: {
        keys,
        ...(storedSize === null ? {} : { size: storedSize.toString() }),
        convertedContentType: convertedContentType || null,
        ...updateStamps(actorId),
        stx: stripChangedFields(attachmentsTable.stx),
      },
    });
    await dispatchMutation(txCtx, 'attachment.updated', { before: [entity], after: [updated] });
    return updated;
  });

  log.info('Attachment keys linked', { attachmentId: linkedRecord.id });

  return withActorRef(ctx, linkedRecord);
}
