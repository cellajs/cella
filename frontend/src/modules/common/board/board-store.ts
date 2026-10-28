import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import { idbKvStorage } from '~/query/idb-kv-storage';

interface BoardUIState {
  panelCollapseState: Record<string, boolean>;
  setPanelCollapsed: (panelId: string, collapsed: boolean) => void;

  activeBoardId: string | null;
  setActiveBoard: (boardId: string) => void;

  /** boardId => (panelId => width in px). */
  boardLayouts: Record<string, Record<string, number>>;
  updateBoardLayout: (boardId: string, layout: Record<string, number>) => void;

  /** Local displayOrder of panels the server does not own, fractional like membership.displayOrder so one comparator sorts both. */
  boardPanelOrders: Record<string, Record<string, number>>;
  setPanelOrder: (boardId: string, panelId: string, displayOrder: number) => void;
  prunePanelOrders: (boardId: string, knownPanelIds: string[]) => void;

  /** Restores the initial state; called on sign-out. */
  reset: () => void;
}

const initStore: Pick<BoardUIState, 'panelCollapseState' | 'activeBoardId' | 'boardLayouts' | 'boardPanelOrders'> = {
  panelCollapseState: {},
  activeBoardId: null,
  boardLayouts: {},
  boardPanelOrders: {},
};

export const useBoardStore = create<BoardUIState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initStore,

        setPanelCollapsed: (panelId, collapsed) => {
          set((state) => {
            const current = state.panelCollapseState[panelId] ?? false;
            if (collapsed === current) return;
            state.panelCollapseState[panelId] = collapsed;
          });
        },

        setActiveBoard: (boardId) => {
          set((state) => {
            state.activeBoardId = boardId;
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

export { useBoardStore as boardStore };
