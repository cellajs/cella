import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { findAttachmentViewCount } from '#/modules/attachment/attachment-queries';
import { withAuditUser } from '#/modules/user/helpers/audit-user';
import { getValidProduct } from '#/permissions/get-valid-product';

export async function getAttachmentOp(ctx: AuthContext, id: string) {
  const { entity: attachment } = await getValidProduct(ctx, id, 'attachment', 'read');

  // withAuditUser queries users (no RLS), findAttachmentViewCount queries counters (no RLS)
  const attachmentResponse = await withAuditUser(ctx, attachment);
  const viewCount = await findAttachmentViewCount(ctx, { entityId: id });

  const data = { ...attachmentResponse, viewCount };
  return { success: true, data } as OperationResult<typeof data>;
}
