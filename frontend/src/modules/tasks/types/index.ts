import type { SubTask, Task } from '~/types/app';

export interface TasksCustomEventMap {
  changeTaskState: CustomEvent<TaskStateInfo>;
  changeSubTaskState: CustomEvent<{ taskId: string; state: TaskStates | 'removeEditing' }>;
  toggleTaskCard: CustomEvent<TaskCardInfo>;
  toggleSelectTask: CustomEvent<TaskSelectInfo>;
  taskOperation: CustomEvent<TaskQueryInfo>;
}

type TaskQueryInfo = {
  array: Task[] | SubTask[] | { id: string }[];
  action: TaskQueryActions;
  projectId?: string;
};

type TaskStateInfo = {
  taskId: string;
  state: TaskStates;
};

type TaskSelectInfo = {
  taskId: string;
  selected: boolean;
};

type TaskCardInfo = {
  taskId: string;
  clickTarget: HTMLElement;
};

export type TaskStates = 'folded' | 'editing' | 'expanded' | 'unsaved';

export type TaskQueryActions = 'create' | 'update' | 'delete' | 'createSubTask' | 'updateSubTask' | 'deleteSubTask';

export interface TaskStatesChangeEvent extends Event {
  detail: TaskStateInfo;
}

export interface TaskOperationEvent extends Event {
  detail: TaskQueryInfo;
}

export interface TaskCardToggleSelectEvent extends Event {
  detail: TaskSelectInfo;
}

export interface TaskCardFocusEvent extends Event {
  detail: TaskCardInfo;
}
