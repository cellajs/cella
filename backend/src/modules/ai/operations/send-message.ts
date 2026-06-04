import type { z } from '@hono/zod-openapi';
import { generateId } from 'shared/entity-id';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { createServerStx } from '#/core/stx';
import { tenantContext } from '#/db/tenant-context';
import { insertMessage } from '#/modules/ai/ai-queries';
import type { messageCreateBodySchema } from '#/modules/ai/ai-schema';
import { getIsoDate } from '#/utils/iso-date';

type SendMessageInput = z.infer<typeof messageCreateBodySchema>;

export async function sendMessageOp(
  ctx: AuthContext,
  chatId: string,
  input: SendMessageInput,
): Promise<OperationResult<{ messageId: string }>> {
  const { userId, organizationId, tenantId } = ctx.var;

  const message = await tenantContext(ctx, (txCtx) =>
    insertMessage(txCtx, {
      id: generateId(),
      entityType: 'message',
      name: '',
      tenantId,
      organizationId,
      chatId,
      userId,
      role: 'user',
      parts: [{ type: 'text', content: input.content }],
      status: 'complete',
      createdAt: getIsoDate(),
      createdBy: userId,
      stx: createServerStx(),
    }),
  );

  return {
    success: true,
    data: { messageId: message.id },
  };
}
