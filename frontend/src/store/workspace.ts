import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage } from 'zustand/middleware';
import type { TaskLabel } from '~/mocks/dataGeneration';
import { config } from 'config';

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

type ViewOptions = {
  status: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[];
  type: ('feature' | 'bug' | 'chore')[];
};

interface WorkspaceState {
  viewOptions: ViewOptions;
  displayOption: 'table' | 'board' | 'tiles';
  columns: Column;
  setColumnRecentLabel: (columnId: string, label: TaskLabel) => void;
  setColumn: (columnId: string, data: Partial<Column[string]>) => void;
  setDisplayOption: (option: 'table' | 'board' | 'tiles') => void;
  changeViewOptions: (newViewOptions: ViewOptions) => void;
}

const defaultColumn = {
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
        viewOptions: {
          status: [],
          type: [],
        },
        displayOption: 'table',
        columns: {},
        setColumn: (columnId: string, data: Partial<Column[string]>) => {
          set((state) => {
            state.columns[columnId] = { ...defaultColumn, ...data };
          });
        },
        setColumnRecentLabel: (columnId: string, label: TaskLabel) => {
          set((state) => {
            const column = state.columns[columnId];
            if (!column) {
              state.columns[columnId] = { ...defaultColumn, recentLabels: [label] };
              return;
            }
            if (!column.recentLabels.some((l) => l.id === label.id)) {
              column.recentLabels.push(label);
              return;
            }
          });
        },
        setDisplayOption: (option: 'table' | 'board' | 'tiles') => {
          set((state) => {
            state.displayOption = option;
          });
        },
        changeViewOptions: (newViewOptions: ViewOptions) => {
          set((state) => {
            state.viewOptions = newViewOptions;
          });
        },
      })),

      {
        version: 1,
        name: `${config.slug}-workspace`,
        partialize: (state) => ({
          columns: state.columns,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
