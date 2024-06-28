import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Label } from '~/modules/common/electric/electrify';
import { type ViewOptions, viewOptions } from '~/modules/projects/board/header/view-options';

type Column = {
  columnId: string;
  width: string;
  minimized: boolean;
  expandAccepted: boolean;
  expandIced: boolean;
  recentLabels: Label[];
  taskIds: string[];
};

type WorkspaceStorage = {
  [key: string]: { viewOptions: ViewOptions; columns: Column[] };
};

interface WorkspaceState {
  workspaces: WorkspaceStorage;
  changeColumn: (workspaceId: string, columnId: string, column: Partial<Column>) => void;
  addNewColumn: (workspaceId: string, column: Column) => void;
  getWorkspaceViewOptions: (workspaceId: string) => ViewOptions;
  setWorkspaceViewOptions: (workspaceId: string, viewOption: keyof ViewOptions, values: string[]) => void;
}

const defaultColumnValues = {
  width: '19rem',
  minimized: false,
  expandAccepted: false,
  expandIced: false,
  recentLabels: [] as Label[],
  taskIds: [] as string[],
};

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((set, get) => ({
        workspaces: {},
        getWorkspaceViewOptions: (workspaceId: string) => {
          const workspace = get().workspaces[workspaceId];
          if (workspace) return workspace.viewOptions;

          // If the workspace doesn't exist, create a new one
          set((state) => {
            state.workspaces[workspaceId] = { viewOptions: viewOptions, columns: [] };
          });

          return viewOptions;
        },

        setWorkspaceViewOptions: (workspaceId: string, viewOption: keyof ViewOptions, values: string[]) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = { viewOptions: viewOptions, columns: [] };
              state.workspaces[workspaceId].viewOptions[viewOption] = values;
            } else {
              workspace.viewOptions[viewOption] = values;
            }
          });
        },
        addNewColumn: (workspaceId: string, column: Column) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: [], type: [], labels: [] },
                columns: [column],
              };
            } else {
              workspace.columns.push(column);
            }
          });
        },
        changeColumn: (workspaceId: string, columnId: string, newColumn: Partial<Column>) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) return;

            const columnIndex = workspace.columns.findIndex((column) => column.columnId === columnId);
            if (columnIndex === -1) {
              // If the column doesn't exist, create a new one
              state.workspaces[workspaceId].columns.push({ columnId, ...defaultColumnValues, ...newColumn });
            } else {
              // If the column exists, update it
              const updatedColumn = {
                ...workspace.columns[columnIndex],
                ...newColumn,
              };
              state.workspaces[workspaceId].columns[columnIndex] = updatedColumn;
            }
          });
        },
      })),

      {
        version: 1,
        name: `${config.slug}-workspace`,
        partialize: (state) => ({
          workspaces: state.workspaces,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
