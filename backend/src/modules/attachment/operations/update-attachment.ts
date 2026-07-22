import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantContext } from '#/db/tenant-context';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import { attachmentContract, type attachmentUpdateStxBodySchema } from '#/modules/attachment/attachment-schema';
import { withAuditUser, withAuditUserLite } from '#/modules/user/helpers/audit-user';
import { getValidProduct } from '#/permissions/get-valid-product';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

type UpdateAttachmentInput = z.infer<typeof attachmentUpdateStxBodySchema>;

export async function updateAttachmentOp(
  ctx: AuthContext,
  id: string,
  input: UpdateAttachmentInput,
  opts: { fullResponse?: boolean },
) {
  const { ops: rawOps, stx } = input;
  const { fullResponse } = opts;
  const user = ctx.var.user;

  // Single tenantContext wraps permission check + write to avoid double-transaction pool pressure
  const updatedAttachmentRecord = await tenantContext(ctx, async (txCtx) => {
    const { entity } = await getValidProduct(txCtx, id, 'attachment', 'update');

    const resolved = attachmentContract.resolveUpdateOps(entity, rawOps, stx);

    const values = {
      ...(resolved.changed ? resolved.values : {}),
      updatedAt: getIsoDate(),
      updatedBy: user.id,
      ...(resolved.changed ? { stx: resolved.stx } : {}),
    };
    return updateAttachment(txCtx, { id, values });
  });

  log.info('Attachment updated', { attachmentId: updatedAttachmentRecord.id });

  const attachmentResponse = fullResponse
    ? await withAuditUser(ctx, updatedAttachmentRecord, user)
    : withAuditUserLite(updatedAttachmentRecord, user);

  return { success: true, data: attachmentResponse } as OperationResult<typeof attachmentResponse>;
}
