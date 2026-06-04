import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { OperationResult } from '#/core/operation-result';
import type { MessageModel } from '#/db/schema/messages';
import { tenantRead } from '#/db/tenant-context';
import { findChatById, findMessagesByChat } from '#/modules/ai/ai-queries';
import type { messageListQuerySchema } from '#/modules/ai/ai-schema';

type GetMessagesInput = z.infer<typeof messageListQuerySchema>;

export async function getMessagesOp(
  ctx: AuthContext,
  chatId: string,
  input: GetMessagesInput,
): Promise<OperationResult<{ items: MessageModel[]; total: number }>> {
  const result = await tenantRead(ctx, async (readCtx) => {
    const chat = await findChatById(readCtx, chatId);
    if (!chat) throw new AppError(404, 'not_found', 'warn', { entityType: 'chat' });
    if (chat.userId !== ctx.var.userId) throw new AppError(403, 'forbidden', 'warn', { entityType: 'chat' });

    return findMessagesByChat(readCtx, {
      chatId,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      order: input.order ?? 'asc',
    });
  });

  return { success: true, data: result };
}
