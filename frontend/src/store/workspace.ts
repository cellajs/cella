import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { TaskLabel } from '~/mocks/workspaces';

type Column = {
  columnId: string;
  width: string;
  minimized: boolean;
  expandAccepted: boolean;
  expandIced: boolean;
  recentLabels: TaskLabel[];
  taskIds: string[];
};

type ViewOptions = {
  status: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[];
  type: ('feature' | 'bug' | 'chore')[];
  labels: ('primary' | 'secondary')[];
};

type WorkspaceStorage = {
  [key: string]: { viewOptions: ViewOptions; columns: Column[] };
};

interface WorkspaceState {
  workspaces: WorkspaceStorage;
  changeColumn: (workspaceId: string, columnId: string, column: Partial<Column>) => void;
  addNewColumn: (workspaceId: string, column: Column) => void;
  changeViewOptionsLabels: (workspaceId: string, newLabels: ('primary' | 'secondary')[]) => void;
  changeViewOptionsStatus: (
    workspaceId: string,
    newStatuses: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[],
  ) => void;
  changeViewOptionsTypes: (workspaceId: string, newTypes: ('feature' | 'bug' | 'chore')[]) => void;
}

const defaultColumnValues = {
  width: '200px',
  minimized: false,
  expandAccepted: false,
  expandIced: false,
  recentLabels: [] as TaskLabel[],
  taskIds: [] as string[],
};

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((set) => ({
        workspaces: {},
     
        changeViewOptionsStatus: (
          workspaceId: string,
          newStatuses: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[],
        ) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: newStatuses, type: [], labels: [] },
                columns: [],
              };
            } else {
              workspace.viewOptions.status = newStatuses;
            }
          });
        },
        changeViewOptionsTypes: (workspaceId: string, newTypes: ('feature' | 'bug' | 'chore')[]) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: [], type: newTypes, labels: [] },
                columns: [],
              };
            } else {
              workspace.viewOptions.type = newTypes;
            }
          });
        },
        changeViewOptionsLabels: (workspaceId: string, newLabels: ('primary' | 'secondary')[]) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: [], type: [], labels: newLabels },
                columns: [],
              };
            } else {
              workspace.viewOptions.labels = newLabels;
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
