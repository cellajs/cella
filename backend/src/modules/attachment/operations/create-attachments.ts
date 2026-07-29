import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { buildStx } from '#/core/stx';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import { findAttachmentsByStxMutationId, insertAttachments } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentCreateManyStxBodySchema } from '#/modules/attachment/attachment-schema';
import { getOrganizationEntityCount } from '#/modules/entities/entities-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { canCreateEntity } from '#/permissions/can-create';
import { checkIdempotency } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type CreateAttachmentsInput = z.infer<typeof attachmentCreateManyStxBodySchema>;
export async function createAttachmentsOp(ctx: AuthContext, rawInput: CreateAttachmentsInput) {
  // Lens seam: normalize old-shape field names to their current names before any body access
  const input = rawInput.map((item) => attachmentContract.normalizeCreateItem(item));
  const { organization, tenant } = ctx.var;
  const attachmentRestrictions = tenant.restrictions.quotas.attachment;

  if (attachmentRestrictions !== 0 && input.length > attachmentRestrictions) {
    throw new AppError(429, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  // Idempotency check
  const batchStxId = input[0].stx.mutationId;
  const existing = await checkIdempotency(batchStxId, () =>
    tenantRead(ctx, async (readCtx) => {
      const batch = await findAttachmentsByStxMutationId(readCtx, { mutationId: batchStxId });
      return withAuditUsers(readCtx, batch);
    }),
  );
  if (existing) return { data: existing, rejectedIds: [] as string[] };

  const currentAttachments = await getOrganizationEntityCount(ctx, {
    organizationId: organization.id,
    entityType: 'attachment',
  });

  if (attachmentRestrictions !== 0 && currentAttachments + input.length > attachmentRestrictions) {
    throw new AppError(429, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

  const attachmentsToInsert = input.map(({ stx, ...att }) => {
    const attachment = {
      ...att,
      convertedKey: att.convertedKey || null,
      convertedContentType: att.convertedContentType || null,
      thumbnailKey: att.thumbnailKey || null,
      groupId: att.groupId || null,
      tenantId: organization.tenantId,
      organizationId: organization.id,
      createdAt: getIsoDate(),
      createdBy: ctx.var.user.id,
      stx: buildStx(stx),
    };

    // Derive the create-check channel scope from the row per the hierarchy (org for cella; an app
    // that re-homes attachments on a product entity picks up its channel ids with no change here).
    canCreateEntity(ctx, buildSubjectFromEntity('attachment', attachment));
    return attachment;
  });

  const createdAttachments = await tenantContext(ctx, (txCtx) =>
    insertAttachments(txCtx, { attachments: attachmentsToInsert }),
  );

  log.info('Attachments created', { count: createdAttachments.length });

  const attachmentResponses = await withAuditUsers(ctx, createdAttachments, ctx.var.user);

  return { data: attachmentResponses, rejectedIds: [] as string[] };
}
