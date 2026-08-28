import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { buildStx } from '#/core/stx';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import type { InsertAttachmentModel } from '#/modules/attachment/attachment-db';
import { findAttachmentsByStxMutationId, insertAttachments } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentCreateManyStxBodySchema } from '#/modules/attachment/attachment-schema';
import { resolveAttachmentPlacement } from '#/modules/attachment/helpers/attachment-placement';
import { getOrganizationEntityCount } from '#/modules/entities/entities-queries';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { canCreateEntity } from '#/permissions/can-create';
import { checkIdempotency } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type CreateAttachmentsInput = z.infer<typeof attachmentCreateManyStxBodySchema>;
export async function createAttachmentsOp(ctx: AuthContext, rawInput: CreateAttachmentsInput) {
  const input = rawInput.map((item) => attachmentContract.normalizeCreateItem(item));
  const { organization, tenant } = ctx.var;
  const attachmentRestrictions = tenant.restrictions.quotas.attachment;

  if (attachmentRestrictions !== 0 && input.length > attachmentRestrictions) {
    throw new AppError(429, 'restrict_by_org', 'warn', { entityType: 'attachment' });
  }

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

  const now = getIsoDate();
  const attachmentsToInsert: InsertAttachmentModel[] = [];
  for (const { stx, ...att } of input) {
    // Placement seam: ancestor columns derived server-side; the org-homed default stamps none.
    const placement = await resolveAttachmentPlacement(ctx, att);

    const attachment = {
      ...att,
      convertedContentType: att.convertedContentType || null,
      groupId: att.groupId || null,
      ...placement,
      tenantId: organization.tenantId,
      organizationId: organization.id,
      createdAt: now,
      createdBy: ctx.var.user.id,
      stx: buildStx(stx),
    };

    // The create-check channel scope comes from the row's hierarchy ancestors, so re-homing
    // attachments on a product entity needs no change here.
    canCreateEntity(ctx, buildSubjectFromEntity('attachment', attachment));
    attachmentsToInsert.push(attachment);
  }

  const createdAttachments = await tenantContext(ctx, (txCtx) =>
    insertAttachments(txCtx, { attachments: attachmentsToInsert }),
  );

  log.info('Attachments created', { count: createdAttachments.length });

  const attachmentResponses = await withAuditUsers(ctx, createdAttachments, ctx.var.user);

  return { data: attachmentResponses, rejectedIds: [] as string[] };
}
