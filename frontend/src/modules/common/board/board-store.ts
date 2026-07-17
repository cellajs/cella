import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface BoardUIState {
  // Panel collapse state
  panelCollapseState: Record<string, boolean>;
  togglePanelCollapsedState: (panelId: string, newState: boolean) => void;

  // Active board context
  activeBoardId: string | null;
  activeBoardType: string | null;
  setActiveBoard: (boardId: string, boardType: string) => void;

  // Active panel, set by hover/focus on desktop or tab on mobile. Only one can be active.
  activePanelId: string | null;
  setActivePanel: (panelId: string | null) => void;

  // Board layouts: boardId => (panelId => size in pixels)
  boardLayouts: Record<string, Record<string, number>>;
  updateBoardLayout: (boardId: string, layout: Record<string, number>) => void;

  // Local displayOrder for panels whose order isn't server-owned (e.g. explainer, ai-chat).
  // Uses the same fractional-indexing convention as membership.displayOrder so a single
  // comparator can sort server-owned and local-only panels together.
  boardPanelOrders: Record<string, Record<string, number>>;
  setPanelOrder: (boardId: string, panelId: string, displayOrder: number) => void;
  prunePanelOrders: (boardId: string, knownPanelIds: string[]) => void;

  reset: () => void; // Resets in-memory state to initial (call on sign-out)
}

// Default state values
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

        togglePanelCollapsedState: (panelId, newState) => {
          set((state) => {
            const current = state.panelCollapseState[panelId] ?? false;
            if (newState === current) return;
            state.panelCollapseState[panelId] = newState;
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
            const map = state.boardPanelOrders[boardId] ?? {};
            if (map[panelId] === displayOrder) return;
            map[panelId] = displayOrder;
            state.boardPanelOrders[boardId] = map;
          });
        },

        prunePanelOrders: (boardId, knownPanelIds) => {
          const map = get().boardPanelOrders[boardId];
          if (!map) return;
          const known = new Set(knownPanelIds);
          const stale = Object.keys(map).filter((panelId) => !known.has(panelId));
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
