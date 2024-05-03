import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { TaskLabel } from '~/mocks/workspaces';

type Column = {
  [key: string]: {
    width: string;
    minimized: boolean;
    expandAccepted: boolean;
    expandIced: boolean;
    recentLabels: TaskLabel[];
    taskIds: string[];
  };
};

type WorkspaceStorage = {
  [key: string]: { viewOptions: ViewOptions; displayOption: 'table' | 'board' | 'tiles'; columns: Column[] };
};

type ViewOptions = {
  status: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[];
  type: ('feature' | 'bug' | 'chore')[];
};

interface WorkspaceState {
  workspaces: WorkspaceStorage;
  changeColumn: (workspaceId: string, column: Column) => void;
  addNewColumn: (workspaceId: string, column: Column) => void;
  changeViewOptions: (workspaceId: string, newViewOptions: ViewOptions) => void;
  changeDisplayOption: (workspaceId: string, newDisplayOption: 'table' | 'board' | 'tiles') => void;
}

// const defaultColumn = {
//   width: '200px',
//   minimized: false,
//   expandAccepted: false,
//   expandIced: false,
//   recentLabels: [] as TaskLabel[],
//   taskIds: [] as string[],
// };

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((set) => ({
        workspaces: {},
        changeDisplayOption: (workspaceId: string, newDisplayOption: 'table' | 'board' | 'tiles') => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: [], type: [] },
                displayOption: newDisplayOption,
                columns: [],
              };
            } else {
              workspace.displayOption = newDisplayOption;
            }
          });
        },
        changeViewOptions: (workspaceId: string, newViewOptions: ViewOptions) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: newViewOptions,
                displayOption: 'table',
                columns: [],
              };
            } else {
              workspace.viewOptions = newViewOptions;
            }
          });
        },
        addNewColumn: (workspaceId: string, column: Column) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            if (!workspace) {
              state.workspaces[workspaceId] = {
                viewOptions: { status: [], type: [] },
                displayOption: 'table',
                columns: [column],
              };
            } else {
              workspace.columns.push(column);
            }
          });
        },
        changeColumn: (workspaceId: string, newColumn: Column) => {
          set((state) => {
            const workspace = state.workspaces[workspaceId];
            for (const column of workspace.columns) {
              if (column.id === newColumn.id) {
                column.width = newColumn.width;
                column.minimized = newColumn.minimized;
                column.expandAccepted = newColumn.expandAccepted;
                column.expandIced = newColumn.expandIced;
                column.recentLabels = newColumn.recentLabels;
                column.taskIds = newColumn.taskIds;
                break;
              }
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
