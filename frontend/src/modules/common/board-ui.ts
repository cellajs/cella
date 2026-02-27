import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';

interface BoardUIState {
  // Panel collapse state
  panelCollapseState: Record<string, boolean>;
  togglePanelCollapsedState: (panelId: string, newState: boolean) => void;

  // Active board context
  activeBoardId: string | null;
  activeBoardType: 'project' | 'workspace' | null;
  setActiveBoard: (boardId: string, boardType: 'project' | 'workspace') => void;

  // Board layouts: boardId => (columnId => size percentage)
  boardLayouts: Record<string, Record<string, number>>;
  updateBoardLayout: (boardId: string, layout: Record<string, number>) => void;
}

export const useBoardUIStore = create<BoardUIState>()(
  devtools(
    persist(
      immer((set) => ({
        panelCollapseState: {},
        activeBoardId: null,
        activeBoardType: null,
        boardLayouts: {},

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

        updateBoardLayout: (boardId, layout) => {
          set((state) => {
            state.boardLayouts[boardId] = layout;
          });
        },
      })),
      {
        version: 10,
        name: `${appConfig.slug}-board-ui`,
        partialize: (state) => ({
          panelCollapseState: state.panelCollapseState,
          boardLayouts: state.boardLayouts,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
