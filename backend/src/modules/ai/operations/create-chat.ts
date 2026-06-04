import type { z } from '@hono/zod-openapi';
import { generateId } from 'shared/entity-id';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { createServerStx } from '#/core/stx';
import { tenantContext } from '#/db/tenant-context';
import { insertChat, insertMessage } from '#/modules/ai/ai-queries';
import type { chatCreateBodySchema } from '#/modules/ai/ai-schema';
import { getIsoDate } from '#/utils/iso-date';

type CreateChatInput = z.infer<typeof chatCreateBodySchema>;

export async function createChatOp(
  ctx: AuthContext,
  input: CreateChatInput,
): Promise<OperationResult<{ chatId: string }>> {
  const { userId, organizationId, tenantId } = ctx.var;
  const now = getIsoDate();
  const chatId = generateId();
  const messageId = generateId();

  await tenantContext(ctx, async (txCtx) => {
    await insertChat(txCtx, {
      id: chatId,
      entityType: 'chat',
      name: input.content.slice(0, 100),
      tenantId,
      organizationId,
      userId,
      model: '',
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      createdAt: now,
      createdBy: userId,
      stx: createServerStx(),
    });

    await insertMessage(txCtx, {
      id: messageId,
      entityType: 'message',
      name: '',
      tenantId,
      organizationId,
      chatId,
      userId,
      workspaceId: input.workspaceId ?? null,
      projectId: input.projectId ?? null,
      role: 'user',
      parts: [{ type: 'text', content: input.content }],
      status: 'complete',
      createdAt: now,
      createdBy: userId,
      stx: createServerStx(),
    });
  });

  return { success: true, data: { chatId } };
}
