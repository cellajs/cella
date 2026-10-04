import type { z } from '@hono/zod-openapi';
import { uploadStorage } from 'shared/utils/upload-visibility';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { buildStx } from '#/core/stx';
import { tenantContext } from '#/db/tenant-context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { attachmentsTable, type InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { resolveAttachmentPlacement } from '#/modules/attachment/attachment-placement';
import { insertAttachments } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentCreateManyStxBodySchema } from '#/modules/attachment/attachment-schema';
import { namesOwnStorage } from '#/modules/attachment/helpers/storage-key';
import { getOrganizationEntityCount } from '#/modules/entities/entities-queries';
import { withAuditUsers } from '#/modules/user/operations/with-audit-users';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { canCreateEntity } from '#/permissions/can-create';
import { checkIdempotency } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type CreateAttachmentsInput = z.infer<typeof attachmentCreateManyStxBodySchema>;
export async function createAttachmentsOp(ctx: OrgContext, rawInput: CreateAttachmentsInput) {
  const input = rawInput.map((item) => attachmentContract.normalizeCreateItem(item));
  const { organization, tenant } = ctx.var;
  const attachmentRestrictions = tenant.restrictions.quotas.attachment;

  if (attachmentRestrictions !== 0 && input.length > attachmentRestrictions) {
    throw new AppError(429, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  const batchStxId = input[0].stx.mutationId;
  const existing = await checkIdempotency(ctx, attachmentsTable, batchStxId);
  if (existing) return { data: await withAuditUsers(ctx, existing), rejectedIds: [] as string[] };

  const currentAttachments = await getOrganizationEntityCount(ctx, { organizationId: organization.id, entityType: 'attachment' });

  if (attachmentRestrictions !== 0 && currentAttachments + input.length > attachmentRestrictions) {
    throw new AppError(429, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  const now = getIsoDate();
  // The attachment upload template decides the bucket; the server stamps it on every row and ignores what a client
  // claims, so a row never names storage its upload did not use.
  const storage = uploadStorage('attachment');
  const attachmentsToInsert: InsertAttachmentModel[] = [];
  for (const { stx, ...att } of input) {
    // The backend later signs these keys: they must name this organization's uploads.
    if (!namesOwnStorage(att.keys, organization.id)) {
      throw new AppError(400, 'invalid_request', 'warn', { entityType: 'attachment', meta: { reason: 'storage_key' } });
    }
    attachmentContract.assertBlockFields(att, organization.id);

    // Placement seam: ancestor columns derived server-side; the org-homed default stamps none.
    const placement = await resolveAttachmentPlacement(ctx, att);

    const attachment = {
      ...att,
      ...storage,
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

  const attachmentResponses = await withAuditUsers(ctx, createdAttachments);

  return { data: attachmentResponses, rejectedIds: [] as string[] };
}
