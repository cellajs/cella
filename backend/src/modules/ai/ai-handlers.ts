import { OpenAPIHono } from '@hono/zod-openapi';
import type { Env } from '#/core/context';
import { assertSuccess } from '#/core/operation-result';
import aiRoutes from '#/modules/ai/ai-routes';
import '#/modules/ai/ai-module';
import { createChatOp } from '#/modules/ai/operations/create-chat';
import { deleteChatsOp } from '#/modules/ai/operations/delete-chats';
import { getChatsOp } from '#/modules/ai/operations/get-chats';
import { getMessagesOp } from '#/modules/ai/operations/get-messages';
import { sendMessageOp } from '#/modules/ai/operations/send-message';
import { updateChatOp } from '#/modules/ai/operations/update-chat';
import { streamChatResponse } from '#/modules/ai/stream/stream-chat';
import { defaultHook } from '#/utils/default-hook';

const app = new OpenAPIHono<Env>({ defaultHook });

// biome-ignore lint/suspicious/noExplicitAny: SSE streaming bypasses Hono typed response
app.openapi(aiRoutes.createChat, async (ctx): Promise<any> => {
  const { content } = ctx.req.valid('json');
  const result = await createChatOp(ctx, { content });
  assertSuccess(result, 'chat');
  return streamChatResponse(ctx, result.data.chatId, {
    emitChatCreated: true,
  });
});

app.openapi(aiRoutes.getChats, async (ctx) => {
  const result = await getChatsOp(ctx, ctx.req.valid('query'));
  assertSuccess(result, 'chat');
  return ctx.json(result.data, 200);
});

app.openapi(aiRoutes.getMessages, async (ctx) => {
  const id = ctx.req.param('id');
  const result = await getMessagesOp(ctx, id, ctx.req.valid('query'));
  assertSuccess(result, 'message');
  return ctx.json(result.data, 200);
});

// biome-ignore lint/suspicious/noExplicitAny: SSE streaming bypasses Hono typed response
app.openapi(aiRoutes.sendMessage, async (ctx): Promise<any> => {
  const { content } = ctx.req.valid('json');
  const chatId = ctx.req.param('id');
  const result = await sendMessageOp(ctx, chatId, { content });
  assertSuccess(result, 'message');
  return streamChatResponse(ctx, chatId);
});

app.openapi(aiRoutes.updateChat, async (ctx) => {
  const id = ctx.req.param('id');
  const result = await updateChatOp(ctx, id, ctx.req.valid('json'));
  assertSuccess(result, 'chat');
  return ctx.json(result.data, 200);
});

app.openapi(aiRoutes.deleteChats, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  const result = await deleteChatsOp(ctx, Array.isArray(ids) ? ids : [ids]);
  assertSuccess(result, 'chat');
  return ctx.json(result.data, 200);
});

export const aiHandlers = app;
