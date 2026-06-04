import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { tenantContext } from '#/db/tenant-context';
import { deleteChatsByIds } from '#/modules/ai/ai-queries';

export async function deleteChatsOp(
  ctx: AuthContext,
  ids: string[],
): Promise<OperationResult<{ data: []; rejectedIds: string[] }>> {
  await tenantContext(ctx, async (txCtx) => {
    await deleteChatsByIds(txCtx, ids);
  });

  return { success: true, data: { data: [], rejectedIds: [] } };
}
