import { EventType } from '@ag-ui/core';
import { chat, type ModelMessage, maxIterations, type StreamChunk, toServerSentEventsResponse } from '@tanstack/ai';
import OpenAI from 'openai';
import { generateId } from 'shared/entity-id';
import type { AuthContext } from '#/core/context';
import { createServerStx } from '#/core/stx';
import { tenantContext, tenantRead } from '#/db/tenant-context';
import { env } from '#/env';
import { findMessagesByChat, insertMessage } from '#/modules/ai/ai-queries';
import { CompletionsAdapter } from '#/modules/ai/stream/completions-adapter';
import { buildSystemPrompt } from '#/modules/ai/stream/system-prompt';
import { buildTools } from '#/modules/ai/stream/tool-registry';
import { getIsoDate } from '#/utils/iso-date';

const scalewayModel = 'devstral-2-123b-instruct-2512';
const scalewayBaseUrl = 'https://api.scaleway.ai/v1';

interface StreamOptions {
  /** Emit a `chat.created` CUSTOM event as the first stream chunk (set on chat creation). */
  emitChatCreated?: boolean;
}

export async function streamChatResponse(ctx: AuthContext, chatId: string, options?: StreamOptions): Promise<Response> {
  const apiKey = env.SCW_AI_API_KEY;
  if (!apiKey) {
    throw new Error('SCW_AI_API_KEY is not configured');
  }

  const systemPrompt = await buildSystemPrompt(ctx);
  const history = await loadChatHistory(ctx, chatId);

  const stream = chat({
    adapter: new CompletionsAdapter(new OpenAI({ apiKey, baseURL: scalewayBaseUrl }), scalewayModel),
    messages: history,
    systemPrompts: [systemPrompt],
    tools: buildTools(ctx),
    agentLoopStrategy: maxIterations(5),
  });

  return toServerSentEventsResponse(persistAssistantMessage(ctx, chatId, stream, options));
}

async function loadChatHistory(ctx: AuthContext, chatId: string): Promise<Array<ModelMessage<string | null>>> {
  const { items } = await tenantRead(ctx, (readCtx) =>
    findMessagesByChat(readCtx, { chatId, limit: 100, offset: 0, order: 'asc' }),
  );

  return items.map((msg): ModelMessage<string | null> => {
    const parts = (msg.parts ?? []) as Array<{ type: string; content?: string }>;
    const textContent = parts
      .filter((p) => p.type === 'text')
      .map((p) => p.content ?? '')
      .join('');

    return {
      role: msg.role as 'user' | 'assistant' | 'tool',
      content: textContent || null,
    };
  });
}

interface CollectedParts {
  type: string;
  content?: string;
  [key: string]: unknown;
}

async function* persistAssistantMessage(
  ctx: AuthContext,
  chatId: string,
  stream: AsyncIterable<StreamChunk>,
  options?: StreamOptions,
): AsyncIterable<StreamChunk> {
  const assistantMessages = new Map<string, string>();
  let latestAssistantMessageId: string | null = null;
  let model: string | undefined;

  if (options?.emitChatCreated) {
    yield { type: EventType.CUSTOM, name: 'chat.created', value: { chatId }, timestamp: Date.now() };
  }

  for await (const chunk of stream) {
    if (chunk.model) {
      model = chunk.model;
    }

    if (chunk.type === 'TEXT_MESSAGE_START' && chunk.role === 'assistant') {
      assistantMessages.set(chunk.messageId, '');
      latestAssistantMessageId = chunk.messageId;
    }

    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      const currentText = assistantMessages.get(chunk.messageId);
      if (currentText !== undefined) {
        assistantMessages.set(chunk.messageId, `${currentText}${chunk.delta}`);
      }
    }

    yield chunk;
  }

  const latestText = latestAssistantMessageId ? assistantMessages.get(latestAssistantMessageId) : null;
  if (!latestText?.trim()) {
    return;
  }

  const parts: CollectedParts[] = [{ type: 'text', content: latestText }];
  const { userId, organizationId, tenantId } = ctx.var;

  try {
    await tenantContext(ctx, (txCtx) =>
      insertMessage(txCtx, {
        id: generateId(),
        entityType: 'message',
        name: '',
        tenantId,
        organizationId,
        chatId,
        userId,
        role: 'assistant',
        parts,
        model: model ?? scalewayModel,
        status: 'complete',
        createdAt: getIsoDate(),
        createdBy: userId,
        stx: createServerStx(),
      }),
    );
  } catch (error) {
    console.error('[ai-chat] Failed to persist assistant message:', error);
  }
}
