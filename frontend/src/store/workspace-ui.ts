import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Label } from '~/types/app';

type Column = {
  columnId: string;
  minimized: boolean;
  expandAccepted: boolean;
  expandIced: boolean;
  recentLabels: Label[];
  taskIds: string[];
};

type WorkspaceUIById = {
  [workspaceId: string]: { [columnId: string]: Column };
};
type workspacesPanels = {
  [workspaceId: string]: string;
};

const defaultColumnValues = {
  minimized: false,
  expandAccepted: false,
  expandIced: false,
  recentLabels: [] as Label[],
  taskIds: [] as string[],
};

interface WorkspaceUIState {
  workspaces: WorkspaceUIById;
  workspacesPanels: workspacesPanels;
  changePanels: (workspaceId: string, panels: string) => void;
  addNewColumn: (workspaceId: string, columnId: string, column: Column) => void;
  changeColumn: (workspaceId: string, columnId: string, column: Partial<Column>) => void;
}

export const useWorkspaceUIStore = create<WorkspaceUIState>()(
  devtools(
    persist(
      immer((set) => ({
        workspaces: {},
        workspacesPanels: {},
        addNewColumn: (workspaceId: string, columnId: string, column: Column) => {
          set((state) => {
            if (!state.workspaces[workspaceId]) {
              // Initialize the workspace if it doesn't exist
              state.workspaces[workspaceId] = {};
            }
            state.workspaces[workspaceId][columnId] = { ...defaultColumnValues, ...column };
          });
        },
        // Modify an existing column or add it if it doesn't exist
        changeColumn: (workspaceId: string, columnId: string, newColumn: Partial<Column>) => {
          set((state) => {
            if (!state.workspaces[workspaceId]) {
              // Initialize the workspace if it doesn't exist
              state.workspaces[workspaceId] = {};
            }
            if (!state.workspaces[workspaceId][columnId]) {
              // Add a new column if it doesn't exist
              state.workspaces[workspaceId][columnId] = { ...defaultColumnValues, columnId };
            }
            // Update the existing column with new values
            state.workspaces[workspaceId][columnId] = {
              ...state.workspaces[workspaceId][columnId],
              ...newColumn,
            };
          });
        },
        changePanels: (workspaceId: string, panel: string) => {
          set((state) => {
            // Update the panels for the specified workspace
            state.workspacesPanels[workspaceId] = panel;
          });
        },
      })),

      {
        version: 2,
        name: `${config.slug}-workspace-ui`,
        partialize: (state) => ({
          workspaces: state.workspaces,
          workspacesPanels: state.workspacesPanels,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
