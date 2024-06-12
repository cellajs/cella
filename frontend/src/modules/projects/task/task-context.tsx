import { createContext, useContext, useEffect, useRef } from 'react';
import { createStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import type { Task } from '~/modules/common/electric/electrify';

interface TaskProps {
  task: Task;
}

interface TaskState extends TaskProps {}

type TaskStore = ReturnType<typeof createTaskStore>;

const createTaskStore = (initProps?: Partial<TaskProps>) => {
  const DEFAULT_PROPS: TaskProps = {
    task: null as unknown as Task,
  };
  return createStore<TaskState>()(() => ({
    ...DEFAULT_PROPS,
    ...initProps,
  }));
};

export const TaskContext = createContext<TaskStore | null>(null);
type TaskProviderProps = React.PropsWithChildren<TaskProps>;
export function TaskProvider({ children, ...props }: TaskProviderProps) {
  const storeRef = useRef<TaskStore>();
  if (!storeRef.current) {
    storeRef.current = createTaskStore(props);
  }
  useEffect(() => {
    storeRef.current?.setState(props);
  }, [props]);
  return <TaskContext.Provider value={storeRef.current}>{children}</TaskContext.Provider>;
}

export function useTaskContext<T>(selector: (state: TaskState) => T, equalityFn?: (left: T, right: T) => boolean): T {
  const store = useContext(TaskContext);
  if (!store) throw new Error('Missing TaskContext.Provider in the tree');
  return useStoreWithEqualityFn(store, selector, equalityFn);
}
