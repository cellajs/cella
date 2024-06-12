import { createContext, useContext, useEffect, useRef } from 'react';
import { createStore } from 'zustand';
import type { Member, Project } from '~/types';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { Label, Task } from '~/modules/common/electric/electrify';

interface ProjectProps {
  project: Project;
  tasks: Task[];
  labels: Label[];
  members: Member[];
}

interface ProjectState extends ProjectProps {}

type ProjectStore = ReturnType<typeof createProjectStore>;

const createProjectStore = (initProps?: Partial<ProjectProps>) => {
  const DEFAULT_PROPS: ProjectProps = {
    project: null as unknown as Project,
    tasks: [],
    labels: [],
    members: [],
  };
  return createStore<ProjectState>()(() => ({
    ...DEFAULT_PROPS,
    ...initProps,
  }));
};

export const ProjectContext = createContext<ProjectStore | null>(null);
type ProjectProviderProps = React.PropsWithChildren<ProjectProps>;
export function ProjectProvider({ children, ...props }: ProjectProviderProps) {
  const storeRef = useRef<ProjectStore>();
  if (!storeRef.current) {
    storeRef.current = createProjectStore(props);
  }
  useEffect(() => {
    storeRef.current?.setState(props);
  }, [props]);
  return <ProjectContext.Provider value={storeRef.current}>{children}</ProjectContext.Provider>;
}

export function useProjectContext<T>(selector: (state: ProjectState) => T, equalityFn?: (left: T, right: T) => boolean): T {
  const store = useContext(ProjectContext);
  if (!store) throw new Error('Missing ProjectContext.Provider in the tree');
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
