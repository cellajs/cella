import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface BoardUIState {
  panelCollapseState: Record<string, boolean>;
  togglePanelCollapsedState: (panelId: string, collapsed: boolean) => void;

  activeBoardId: string | null;
  activeBoardType: string | null;
  setActiveBoard: (boardId: string, boardType: string) => void;

  // Set by hover/focus on desktop or tab on mobile; only one panel can be active
  activePanelId: string | null;
  setActivePanel: (panelId: string | null) => void;

  // Board layouts: boardId => (panelId => size in pixels)
  boardLayouts: Record<string, Record<string, number>>;
  updateBoardLayout: (boardId: string, layout: Record<string, number>) => void;

  // Local displayOrder for panels the server does not own, in the same fractional-indexing
  // convention as membership.displayOrder so one comparator sorts both kinds together.
  boardPanelOrders: Record<string, Record<string, number>>;
  setPanelOrder: (boardId: string, panelId: string, displayOrder: number) => void;
  prunePanelOrders: (boardId: string, knownPanelIds: string[]) => void;

  reset: () => void; // Resets in-memory state to initial (call on sign-out)
}

const initStore: Pick<
  BoardUIState,
  'panelCollapseState' | 'activeBoardId' | 'activeBoardType' | 'activePanelId' | 'boardLayouts' | 'boardPanelOrders'
> = {
  panelCollapseState: {},
  activeBoardId: null,
  activeBoardType: null,
  activePanelId: null,
  boardLayouts: {},
  boardPanelOrders: {},
};

export const useBoardStore = create<BoardUIState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initStore,

        togglePanelCollapsedState: (panelId, collapsed) => {
          set((state) => {
            const current = state.panelCollapseState[panelId] ?? false;
            if (collapsed === current) return;
            state.panelCollapseState[panelId] = collapsed;
          });
        },

        setActiveBoard: (boardId, boardType) => {
          set((state) => {
            state.activeBoardId = boardId;
            state.activeBoardType = boardType;
          });
        },

        setActivePanel: (panelId) => {
          set((state) => {
            if (state.activePanelId === panelId) return;
            state.activePanelId = panelId;
          });
        },

        updateBoardLayout: (boardId, layout) => {
          set((state) => {
            state.boardLayouts[boardId] = layout;
          });
        },

        setPanelOrder: (boardId, panelId, displayOrder) => {
          set((state) => {
            const orders = state.boardPanelOrders[boardId] ?? {};
            if (orders[panelId] === displayOrder) return;
            orders[panelId] = displayOrder;
            state.boardPanelOrders[boardId] = orders;
          });
        },

        prunePanelOrders: (boardId, knownPanelIds) => {
          const orders = get().boardPanelOrders[boardId];
          if (!orders) return;
          const known = new Set(knownPanelIds);
          const stale = Object.keys(orders).filter((panelId) => !known.has(panelId));
          if (stale.length === 0) return;
          set((state) => {
            const target = state.boardPanelOrders[boardId];
            if (!target) return;
            for (const panelId of stale) delete target[panelId];
          });
        },

        reset: () => set(initStore),
      })),
      {
        version: 1,
        name: 'board',
        skipHydration: true,
        partialize: (state) => ({
          panelCollapseState: state.panelCollapseState,
          boardLayouts: state.boardLayouts,
          boardPanelOrders: state.boardPanelOrders,
        }),
        storage: createJSONStorage(() => idbKvStorage('board')),
      },
    ),
    { enabled: isDebugMode, name: 'board store' },
  ),
);

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useBoardStore as boardStore };
