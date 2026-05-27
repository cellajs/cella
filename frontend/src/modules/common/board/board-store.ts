import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

const arraysEqual = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
};

interface BoardUIState {
  // Panel collapse state
  panelCollapseState: Record<string, boolean>;
  togglePanelCollapsedState: (panelId: string, newState: boolean) => void;

  // Active board context
  activeBoardId: string | null;
  activeBoardType: string | null;
  setActiveBoard: (boardId: string, boardType: string) => void;

  // Active panel (only one at a time — set by hover/focus on desktop, tab on mobile)
  activePanelId: string | null;
  setActivePanel: (panelId: string | null) => void;

  // Board layouts: boardId => (panelId => size in pixels)
  boardLayouts: Record<string, Record<string, number>>;
  updateBoardLayout: (boardId: string, layout: Record<string, number>) => void;

  // Panel ordering hint: boardId => ordered stable slot IDs (project ID or extra panel ID)
  boardPanelOrder: Record<string, string[]>;
  updatePanelOrder: (boardId: string, order: string[]) => void;
  syncBoardPanelOrder: (boardId: string, observedPanelIds: string[]) => string[];
}

export const useBoardStore = create<BoardUIState>()(
  devtools(
    persist(
      immer((set, get) => ({
        panelCollapseState: {},
        activeBoardId: null,
        activeBoardType: null,
        activePanelId: null,
        boardLayouts: {},
        boardPanelOrder: {},

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

        updatePanelOrder: (boardId, order) => {
          set((state) => {
            state.boardPanelOrder[boardId] = order;
          });
        },

        syncBoardPanelOrder: (boardId, observedPanelIds) => {
          const currentOrder = get().boardPanelOrder[boardId] ?? [];
          const observedSet = new Set(observedPanelIds);

          const cleaned = currentOrder.filter((panelId) => observedSet.has(panelId));
          const existing = new Set(cleaned);
          const appended = observedPanelIds.filter((panelId) => !existing.has(panelId));
          const nextOrder = [...cleaned, ...appended];

          if (arraysEqual(currentOrder, nextOrder)) return currentOrder;

          set((state) => {
            state.boardPanelOrder[boardId] = nextOrder;
          });

          return nextOrder;
        },
      })),
      {
        version: 15,
        name: `${appConfig.slug}-board-store`,
        partialize: (state) => ({
          panelCollapseState: state.panelCollapseState,
          boardLayouts: state.boardLayouts,
          boardPanelOrder: state.boardPanelOrder,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
