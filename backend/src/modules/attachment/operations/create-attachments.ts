import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { buildStx } from '#/core/stx';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import { findAttachmentsByStxMutationId, insertAttachments } from '#/modules/attachment/attachment-queries';
import type { attachmentCreateManyStxBodySchema } from '#/modules/attachment/attachment-schema';
import { getOrgEntityCount } from '#/modules/entities/helpers/get-entity-counts';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { canCreateEntity } from '#/permissions/can-create';
import { checkIdempotency } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type CreateAttachmentsInput = z.infer<typeof attachmentCreateManyStxBodySchema>;
export async function createAttachmentsOp(ctx: AuthContext, input: CreateAttachmentsInput) {
  const { organization, tenant } = ctx.var;
  const attachmentRestrictions = tenant.restrictions.quotas.attachment;

  if (attachmentRestrictions !== 0 && input.length > attachmentRestrictions) {
    return { success: false as const, error: 'restrict_by_org', status: 429 as const };
  }

  // Idempotency check
  const batchStxId = input[0].stx.mutationId;
  const existing = await checkIdempotency(batchStxId, () =>
    tenantRead(ctx, async (readCtx) => {
      const batch = await findAttachmentsByStxMutationId(readCtx, { mutationId: batchStxId });
      return withAuditUsers(readCtx, batch);
    }),
  );
  if (existing) return { success: true as const, data: { data: existing, rejectedIds: [] as string[] } };

  const currentAttachments = await getOrgEntityCount(ctx, organization.id, 'attachment');

  if (attachmentRestrictions !== 0 && currentAttachments + input.length > attachmentRestrictions) {
    return { success: false as const, error: 'restrict_by_org', status: 429 as const };
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

    canCreateEntity(ctx, { entityType: 'attachment', contextIds: { organization: organization.id } });
    return attachment;
  });

  const createdAttachments = await tenantContext(ctx, (txCtx) =>
    insertAttachments(txCtx, { attachments: attachmentsToInsert }),
  );

  log.info('Attachments created', { count: createdAttachments.length });

  const attachmentResponses = await withAuditUsers(ctx, createdAttachments, ctx.var.user);

  return { success: true as const, data: { data: attachmentResponses, rejectedIds: [] as string[] } };
}
