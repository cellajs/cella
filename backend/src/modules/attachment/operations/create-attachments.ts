import type { z } from '@hono/zod-openapi';
import { uploadStorage } from 'shared/utils/upload-visibility';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { buildStx } from '#/core/stx';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { attachmentsTable, type InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { insertAttachments } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentCreateManyStxBodySchema } from '#/modules/attachment/attachment-schema';
import { namesUploaderStorage } from '#/modules/attachment/helpers/storage-key';
import { storedFileSize } from '#/modules/attachment/helpers/stored-file';
import { countTenantEntityRows } from '#/modules/entities/entities-queries';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { canCreateEntity } from '#/permissions/can-create';
import { resolvePlacement } from '#/permissions/product-placement';
import { checkIdempotency } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type CreateAttachmentsInput = z.infer<typeof attachmentCreateManyStxBodySchema>;

/**
 * Creates the attachments of a batch after their upload; the server stamps the bucket, reads each size from storage and
 * places each row in its home channel. An item an earlier attempt of this create wrote comes back as its stored row; an
 * item neither created nor the caller's live row is listed in `rejectedIds`.
 * @returns The rows, the rejected ids, and `created` when this request inserted a row.
 * @throws AppError 403 `restrict_by_app` past the tenant's attachment quota; 400 `storage_key` for a key outside the
 * uploader's prefix; 400 `missing_object` for a key that names no stored object.
 */
export async function createAttachmentsOp(ctx: OrgContext, rawInput: CreateAttachmentsInput) {
  const input = rawInput.map((item) => attachmentContract.normalizeCreateItem(item));
  const { organization } = ctx.var;

  // Rows an earlier attempt of this create wrote come back as they are; only the other items are created.
  const replayed = await checkIdempotency(
    ctx,
    attachmentsTable,
    input.map((item) => item.id),
  );
  const replayedIds = new Set(replayed.map((row) => row.id));
  const fresh = input.filter((item) => !replayedIds.has(item.id));
  if (fresh.length === 0) return { data: await withActorRefs(ctx, replayed), rejectedIds: [], created: false };

  const currentAttachments = await countTenantEntityRows(ctx, { entityType: 'attachment' });
  assertTenantQuota(ctx, 'attachment', currentAttachments, fresh.length);

  const now = getIsoDate();
  // The attachment upload template decides the bucket; the server stamps it on every row and ignores what a client
  // claims, so a row never names storage its upload did not use.
  const storage = uploadStorage('attachment');
  // The backend later signs these keys: they must name the caller's own uploads, before the bucket is asked about them.
  if (fresh.some(({ keys }) => !namesUploaderStorage(keys, organization.id, ctx.var.actor.id, { allowLocal: true }))) {
    throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'storage_key' } });
  }
  const storedSizes = await Promise.all(fresh.map(({ keys }) => storedFileSize(keys, storage.bucketName)));

  const attachmentsToInsert: InsertAttachmentModel[] = [];
  for (const [index, { stx, ...att }] of fresh.entries()) {
    attachmentContract.assertBlockFields(att, organization.id);

    // The ancestor columns come from the home channel's own row; a row in the organization carries none.
    const { columns: placement, home } = await resolvePlacement(ctx, 'attachment', att);

    const attachment = {
      ...att,
      ...storage,
      size: storedSizes[index]?.toString() ?? att.size,
      // Public read is the home channel's decision, copied onto the row; a client cannot widen it.
      public: home ? home.entity.public : organization.public,
      convertedContentType: att.convertedContentType || null,
      groupId: att.groupId || null,
      ...placement,
      tenantId: organization.tenantId,
      organizationId: organization.id,
      createdAt: now,
      createdBy: ctx.var.actor.id,
      stx: buildStx(stx),
    };

    // The create-check channel scope comes from the row's hierarchy ancestors, so re-homing
    // attachments on a product entity needs no change here.
    canCreateEntity(ctx, buildSubjectFromEntity('attachment', attachment));
    attachmentsToInsert.push(attachment);
  }

  const createdAttachments = await tenantContext(ctx, async (txCtx) => {
    const rows = await insertAttachments(txCtx, { attachments: attachmentsToInsert });
    // Inside the transaction, so mutation handlers join the write.
    await dispatchMutation(txCtx, 'attachment.created', { after: rows });
    return rows;
  });

  log.info('Attachments created', { count: createdAttachments.length });

  // An attempt of this create running at the same time and committing first leaves this insert without those rows; any
  // other id left out names a row that is not the caller's live one (another actor's, or a deleted one) and is rejected.
  const insertedIds = new Set(createdAttachments.map((row) => row.id));
  const missingIds = fresh.map((item) => item.id).filter((id) => !insertedIds.has(id));
  const committedMeanwhile = missingIds.length > 0 ? await checkIdempotency(ctx, attachmentsTable, missingIds) : [];
  const committedIds = new Set(committedMeanwhile.map((row) => row.id));

  const attachmentResponses = await withActorRefs(ctx, [...replayed, ...createdAttachments, ...committedMeanwhile]);

  return { data: attachmentResponses, rejectedIds: missingIds.filter((id) => !committedIds.has(id)), created: createdAttachments.length > 0 };
}
