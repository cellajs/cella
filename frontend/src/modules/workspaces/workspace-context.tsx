import { createContext, useContext, useEffect, useRef } from 'react';
import { createStore } from 'zustand';
import type { Project, Workspace } from '~/types';
import { useStoreWithEqualityFn } from 'zustand/traditional';

interface WorkspaceProps {
  workspace: Workspace;
  projects: Project[];
  selectedTasks: string[];
  searchQuery: string;
  setSelectedTasks: (tasks: string[]) => void;
  setSearchQuery: (query: string) => void;
  focusedTaskId: string | null;
  setFocusedTaskId: (taskId: string | null) => void;
  focusedProjectIndex: number | null;
  setFocusedProjectIndex: (index: number | null) => void;
}

interface WorkspaceState extends WorkspaceProps {}

type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;

const createWorkspaceStore = (initProps?: Partial<WorkspaceProps>) => {
  const DEFAULT_PROPS: WorkspaceProps = {
    workspace: null as unknown as Workspace,
    projects: [],
    selectedTasks: [],
    searchQuery: '',
    setSelectedTasks: () => {},
    setSearchQuery: () => {},
    focusedTaskId: null,
    setFocusedTaskId: () => {},
    focusedProjectIndex: null,
    setFocusedProjectIndex: () => {},
  };
  return createStore<WorkspaceState>()(() => ({
    ...DEFAULT_PROPS,
    ...initProps,
  }));
};

export const WorkspaceContext = createContext<WorkspaceStore | null>(null);
type WorkspaceProviderProps = React.PropsWithChildren<WorkspaceProps>;
export function WorkspaceProvider({ children, ...props }: WorkspaceProviderProps) {
  const storeRef = useRef<WorkspaceStore>();
  if (!storeRef.current) {
    storeRef.current = createWorkspaceStore(props);
  }
  useEffect(() => {
    storeRef.current?.setState(props);
  }, [props]);
  return <WorkspaceContext.Provider value={storeRef.current}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext<T>(selector: (state: WorkspaceState) => T, equalityFn?: (left: T, right: T) => boolean): T {
  const store = useContext(WorkspaceContext);
  if (!store) throw new Error('Missing WorkspaceContext.Provider in the tree');
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
