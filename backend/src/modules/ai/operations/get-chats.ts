import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import type { ChatModel } from '#/db/schema/chats';
import { tenantRead } from '#/db/tenant-context';
import { findChatsByUser } from '#/modules/ai/ai-queries';
import type { chatListQuerySchema } from '#/modules/ai/ai-schema';

type GetChatsInput = z.infer<typeof chatListQuerySchema>;

export async function getChatsOp(
  ctx: AuthContext,
  input: GetChatsInput,
): Promise<OperationResult<{ items: ChatModel[]; total: number }>> {
  const { userId } = ctx.var;

  const result = await tenantRead(ctx, (readCtx) =>
    findChatsByUser(readCtx, {
      userId,
      archived: input.archived === 'true',
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      order: input.order ?? 'desc',
      workspaceId: input.workspaceId,
      projectId: input.projectId,
    }),
  );

  return { success: true, data: result };
}
