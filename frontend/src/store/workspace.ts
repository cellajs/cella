import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Label } from '~/types';
import type { Workspace, WorkspaceStoreProject } from '~/types';

interface WorkspaceState {
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  projects: WorkspaceStoreProject[];
  setProjects: (projects: WorkspaceStoreProject[]) => void;
  labels: Label[];
  setLabels: (labels: Label[]) => void;
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
      setWorkspace: (workspace) => {
        set((state) => {
          state.workspace = workspace;
        });
      },
      setProjects: (projects) => {
        set((state) => {
          state.projects = projects;
        });
      },
      setLabels: (labels) => {
        set((state) => {
          state.labels = labels;
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
