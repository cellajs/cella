import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Label } from '~/modules/common/electric/electrify';
import type { Project, Workspace, WorkspaceStoreMember } from '~/types';

interface WorkspaceState {
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  projects: Project[];
  setProjects: (projects: Project[]) => void;
  members: WorkspaceStoreMember[];
  setMembers: (members: WorkspaceStoreMember[]) => void;
  labels: Label[];
  setLabels: (labels: Label[]) => void;
  selectedTasks: string[];
  searchQuery: string;
  setSelectedTasks: (tasks: string[]) => void;
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
      setWorkspace: (workspace) => {
        set((state) => {
          state.workspace = workspace;
        });
      },
      projects: [],
      setProjects: (projects) => {
        set((state) => {
          state.projects = projects;
        });
      },
      members: [],
      setMembers: (members) => {
        set((state) => {
          state.members = members;
        });
      },
      labels: [],
      setLabels: (labels) => {
        set((state) => {
          state.labels = labels;
        });
      },
      selectedTasks: [],
      searchQuery: '',
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
      focusedTaskId: null,
      setFocusedTaskId: (id) => {
        set((state) => {
          state.focusedTaskId = id;
        });
      },
      showPageHeader: false,
      togglePageHeader: () => {
        set((state) => {
          state.showPageHeader = !state.showPageHeader;
        });
      },
    })),
  ),
);
