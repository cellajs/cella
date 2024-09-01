import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Label } from '~/types';
import type { Workspace, WorkspaceStoreProject } from '~/types';

interface WorkspaceState {
  workspace: Workspace;
  projects: WorkspaceStoreProject[];
  labels: Label[];
  setWorkspace: (workspace: Workspace, projects: WorkspaceStoreProject[] | undefined, labels: Label[] | undefined) => void;
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
      labels: [],
      selectedTasks: [],
      searchQuery: '',
      focusedTaskId: null,
      showPageHeader: false,
      setWorkspace: (workspace, projects, labels) => {
        set((state) => {
          state.workspace = workspace;
          if (projects) state.projects = projects;
          if (labels) state.labels = labels;
        });
      },
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
