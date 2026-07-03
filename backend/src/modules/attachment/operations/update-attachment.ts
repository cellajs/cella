import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { resolveUpdateOps } from '#/core/stx';
// DORMANT (lens system): import { normalizeOps } from 'shared/version-changes';
import { tenantContext } from '#/db/tenant-context';
import { updateAttachment } from '#/modules/attachment/attachment-queries';
import type { attachmentUpdateStxBodySchema } from '#/modules/attachment/attachment-schema';
import { withAuditUser, withAuditUserLite } from '#/modules/user/helpers/audit-user';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

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

  // DORMANT (lens system) — reconnect when lenses are activated.
  // const { ops: rawOps, stx } = normalizeOps('attachment', input.ops, input.stx);

  // Single tenantContext wraps permission check + write to avoid double-transaction pool pressure
  const updatedAttachmentRecord = await tenantContext(ctx, async (txCtx) => {
    const { entity } = await getValidProductEntity(txCtx, id, 'attachment', 'update');

    const resolved = resolveUpdateOps(entity, rawOps, stx);

    const values = {
      ...(resolved.changed ? resolved.values : {}),
      updatedAt: getIsoDate(),
      updatedBy: user.id,
      ...(resolved.changed ? { stx: resolved.stx } : {}),
    };
    return updateAttachment(txCtx, { id, values });
  });

  logEvent(ctx, 'info', 'Attachment updated', { attachmentId: updatedAttachmentRecord.id });

  const attachmentResponse = fullResponse
    ? await withAuditUser(ctx, updatedAttachmentRecord, user)
    : withAuditUserLite(updatedAttachmentRecord, user);

  return { success: true, data: attachmentResponse } as OperationResult<typeof attachmentResponse>;
}
