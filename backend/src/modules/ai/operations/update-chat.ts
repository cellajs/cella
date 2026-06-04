import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { OperationResult } from '#/core/operation-result';
import type { ChatModel } from '#/db/schema/chats';
import { tenantContext } from '#/db/tenant-context';
import { findChatById, updateChat } from '#/modules/ai/ai-queries';
import type { chatUpdateBodySchema } from '#/modules/ai/ai-schema';
import { getIsoDate } from '#/utils/iso-date';

type UpdateChatInput = z.infer<typeof chatUpdateBodySchema>;

export async function updateChatOp(
  ctx: AuthContext,
  chatId: string,
  input: UpdateChatInput,
): Promise<OperationResult<ChatModel>> {
  const updated = await tenantContext(ctx, async (txCtx) => {
    const chat = await findChatById(txCtx, chatId);
    if (!chat) throw new AppError(404, 'not_found', 'warn', { entityType: 'chat' });
    if (chat.userId !== ctx.var.userId) throw new AppError(403, 'forbidden', 'warn', { entityType: 'chat' });

    const values: Partial<typeof chat> = {};
    if (input.name !== undefined) values.name = input.name;
    if (input.archived !== undefined) values.archivedAt = input.archived ? getIsoDate() : null;

    return updateChat(txCtx, chatId, values);
  });

  return { success: true, data: updated };
}
