import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Workspace } from '~/types/app';

interface WorkspaceState {
  selectedTasks: string[];
  setSelectedTasks: (tasks: string[]) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  focusedTaskId: string | null;
  setFocusedTaskId: (taskId: string | null) => void;
  showPageHeader: boolean;
  togglePageHeader: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    immer((set) => ({
      workspace: null as unknown as Workspace,
      projects: [],
      members: [],
      labels: [],
      selectedTasks: [],
      searchQuery: '',
      focusedTaskId: null,
      showPageHeader: false,
      setSelectedTasks: (tasks) => {
        set((state) => {
          state.selectedTasks = tasks;
        });
      },
      setSearchQuery: (query) => {
        set((state) => {
          state.searchQuery = query;
        });
      },
      setFocusedTaskId: (id) => {
        set((state) => {
          state.focusedTaskId = id;
        });
      },
      togglePageHeader: () => {
        set((state) => {
          state.showPageHeader = !state.showPageHeader;
        });
      },
    })),
  ),
);
