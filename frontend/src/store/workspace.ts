import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage } from 'zustand/middleware';

type Column = Record<
  string,
  { width: string; minimized: boolean; expandAccepted: boolean; expandIced: boolean; recentLabels: string[]; taskIds: string[] }
>;

type ViewOptions = {
  status: ('iced' | 'unstarted' | 'started' | 'finished' | 'delivered' | 'reviewed' | 'accepted')[];
  type: ('feature' | 'bug' | 'chore')[];
};

interface WorkspaceState {
  viewOptions: ViewOptions;
  displayOption: 'table' | 'board' | 'tiles';
  columns: Column[];
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      immer((set) => ({
        viewOptions: {
          status: [],
          type: [],
        },
        displayOption: 'table',
        columns: [{}],
        setColumn: (column: Column) => {
          set((state) => {
            state.columns.push(column);
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
        name: 'workspace',
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
