import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { isDebugMode } from '~/env';

interface AiChatState {
  /** Active chat id keyed by `${tenantId}:${organizationId}` (UI selection only). */
  activeChatIdByOrg: Record<string, string>;
  setActiveChatId: (tenantId: string, organizationId: string, chatId: string | null) => void;
  getActiveChatId: (tenantId: string, organizationId: string) => string | null;
}

const scopeKey = (tenantId: string, organizationId: string) => `${tenantId}:${organizationId}`;

export const useAiChatStore = create<AiChatState>()(
  devtools(
    persist(
      (set, get) => ({
        activeChatIdByOrg: {},
        setActiveChatId: (tenantId, organizationId, chatId) =>
          set((state) => {
            const key = scopeKey(tenantId, organizationId);
            const next = { ...state.activeChatIdByOrg };
            if (chatId) next[key] = chatId;
            else delete next[key];
            return { activeChatIdByOrg: next };
          }),
        getActiveChatId: (tenantId, organizationId) =>
          get().activeChatIdByOrg[scopeKey(tenantId, organizationId)] ?? null,
      }),
      {
        name: `${appConfig.slug}-ai-chat`,
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ activeChatIdByOrg: state.activeChatIdByOrg }),
      },
    ),
    { enabled: isDebugMode, name: 'ai chat store' },
  ),
);
