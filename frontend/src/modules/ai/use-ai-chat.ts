import type { UIMessage } from '@tanstack/ai-client';
import { useChat } from '@tanstack/ai-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useAiChatStore } from './ai-chat-store';
import { createChatConnection } from './chat-connection';
import { chatQueryKeys, chatsListQueryOptions, type Message, messageQueryKeys, messagesQueryOptions } from './query';

interface UseAiChatOptions {
  tenantId: string;
  organizationId: string;
}

export function useAiChat({ tenantId, organizationId }: UseAiChatOptions) {
  const queryClient = useQueryClient();

  const chatId = useAiChatStore((s) => s.activeChatIdByOrg[`${tenantId}:${organizationId}`] ?? null);
  const setActiveChatId = useAiChatStore((s) => s.setActiveChatId);

  const handleChatId = useCallback(
    (nextChatId: string | null) => setActiveChatId(tenantId, organizationId, nextChatId),
    [organizationId, setActiveChatId, tenantId],
  );

  const messagesQuery = useQuery({
    ...messagesQueryOptions({ tenantId, organizationId, id: chatId ?? '' }),
    enabled: !!chatId,
  });

  const chatsQuery = useQuery({
    ...chatsListQueryOptions({ tenantId, organizationId }),
  });

  // Auto-pick the first chat once the list arrives, if no chat is active yet.
  useEffect(() => {
    if (chatId || !chatsQuery.data?.items?.length) return;
    handleChatId(chatsQuery.data.items[0].id);
  }, [chatId, chatsQuery.data?.items, handleChatId]);

  const connection = useMemo(
    () =>
      createChatConnection({
        tenantId,
        organizationId,
        // Read directly from the store so the connection always sees the latest id
        // without re-creating itself when the active chat changes.
        getChatId: () => useAiChatStore.getState().getActiveChatId(tenantId, organizationId),
        onChatId: handleChatId,
      }),
    [handleChatId, organizationId, tenantId],
  );

  // useChat handles SSE streaming + AG-UI event parsing + tool state.
  const chat = useChat({
    connection,
    onFinish: () => {
      const currentChatId = useAiChatStore.getState().getActiveChatId(tenantId, organizationId);
      if (currentChatId) {
        queryClient.invalidateQueries({
          queryKey: messageQueryKeys.list.filtered(organizationId, { chatId: currentChatId }),
        });
      }
      queryClient.invalidateQueries({ queryKey: chatQueryKeys.list.base });
    },
    onError: (error) => console.error('[ai-chat] Stream error:', error),
  });

  // Hydrate from server only when its snapshot is newer/more complete than local state,
  // so streamed assistant replies are never overwritten by stale DB snapshots.
  useEffect(() => {
    if (!chatId || !messagesQuery.data?.items || chat.isLoading) return;
    const serverMessages = toUiMessages(messagesQuery.data.items);
    if (!shouldHydrate(chat.messages, serverMessages)) return;
    chat.setMessages(serverMessages);
  }, [chat, chat.isLoading, chatId, messagesQuery.data?.items]);

  return {
    chatId,
    messages: chat.messages,
    sendMessage: chat.sendMessage,
    isLoading: chat.isLoading,
    error: chat.error,
    stop: chat.stop,
    savedMessages: messagesQuery.data?.items,
    chats: chatsQuery.data?.items,
    isLoadingHistory: messagesQuery.isLoading,
    isLoadingChats: chatsQuery.isLoading,
  };
}

function shouldHydrate(local: UIMessage[], server: UIMessage[]): boolean {
  if (local.length === 0) return true;
  if (server.length !== local.length) return server.length > local.length;
  const localTs = local[local.length - 1].createdAt?.getTime() ?? 0;
  const serverTs = server[server.length - 1].createdAt?.getTime() ?? 0;
  return serverTs > localTs;
}

type UiRole = UIMessage['role'];
const UI_ROLES = ['user', 'assistant', 'system'] as const satisfies readonly UiRole[];
function toUiRole(role: string): UiRole {
  if (role === 'tool') return 'assistant';
  return (UI_ROLES as readonly string[]).includes(role) ? (role as UiRole) : 'assistant';
}

function toUiMessages(messages: Message[]): UIMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: toUiRole(m.role),
    parts: normalizeMessageParts(m.parts),
    createdAt: new Date(m.createdAt),
  }));
}

type Part = UIMessage['parts'][number];
type ToolCallState = Extract<Part, { type: 'tool-call' }>['state'];
type ToolResultState = Extract<Part, { type: 'tool-result' }>['state'];

const isStr = (v: unknown): v is string => typeof v === 'string';

function parsePart(p: Record<string, unknown>): Part | null {
  switch (p.type) {
    case 'text':
      return isStr(p.content) ? { type: 'text', content: p.content } : null;
    case 'thinking':
      return isStr(p.content) ? { type: 'thinking', content: p.content } : null;
    case 'tool-call':
      return isStr(p.id) && isStr(p.name) && isStr(p.arguments) && isStr(p.state)
        ? { type: 'tool-call', id: p.id, name: p.name, arguments: p.arguments, state: p.state as ToolCallState }
        : null;
    case 'tool-result':
      return isStr(p.toolCallId) && isStr(p.content) && isStr(p.state)
        ? { type: 'tool-result', toolCallId: p.toolCallId, content: p.content, state: p.state as ToolResultState }
        : null;
    default:
      return null;
  }
}

function normalizeMessageParts(parts: unknown): UIMessage['parts'] {
  if (!Array.isArray(parts)) return [];
  const out: Part[] = [];
  for (const raw of parts) {
    if (!raw || typeof raw !== 'object') continue;
    const parsed = parsePart(raw as Record<string, unknown>);
    if (parsed) out.push(parsed);
  }
  return out;
}
