import type { ConnectConnectionAdapter, UIMessage } from '@tanstack/ai-client';
import { appConfig } from 'shared';

interface CreateChatConnectionOptions {
  tenantId: string;
  organizationId: string;
  getChatId: () => string | null;
  onChatId: (chatId: string) => void;
}

export function createChatConnection({
  tenantId,
  organizationId,
  getChatId,
  onChatId,
}: CreateChatConnectionOptions): ConnectConnectionAdapter {
  return {
    async *connect(messages, _data, abortSignal) {
      const content = extractLatestUserContent(messages as UIMessage[]);
      if (!content) {
        throw new Error('No user message content to send');
      }

      const chatId = getChatId();
      const url = chatId
        ? `${appConfig.aiUrl}/${tenantId}/${organizationId}/chats/${chatId}/messages`
        : `${appConfig.aiUrl}/${tenantId}/${organizationId}/chats`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include',
        signal: abortSignal,
      });

      if (!response.ok) {
        throw new Error(`AI worker error: ${response.status} ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('AI worker response body is not readable');
      }

      for await (const line of readStreamLines(reader, abortSignal)) {
        const data = line.startsWith('data: ') ? line.slice(6) : line;
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'CUSTOM') {
            // First chunk on chat creation: surface the new chatId to the caller.
            if (parsed.name === 'chat.created' && parsed.value?.chatId) {
              onChatId(parsed.value.chatId);
              continue;
            }
            // Backend wraps upstream provider errors (e.g. 403) in a CUSTOM chunk.
            if (parsed.data?.error) {
              throw new Error(parsed.data.message ?? 'Unknown AI provider error');
            }
          }

          yield parsed;
        } catch (err) {
          // Re-throw real errors (including the one above)
          if (err instanceof Error) throw err;
          // Ignore keep-alives or malformed non-JSON SSE lines.
        }
      }
    },
  };
}

function extractLatestUserContent(messages: UIMessage[]): string | null {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return null;

  const content = lastUserMessage.parts
    .filter((part): part is { type: 'text'; content: string } => part.type === 'text')
    .map((part) => part.content)
    .join('\n')
    .trim();

  return content || null;
}

async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (!abortSignal?.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.trim()) {
          yield line;
        }
      }
    }

    if (buffer.trim()) {
      yield buffer;
    }
  } finally {
    reader.releaseLock();
  }
}
