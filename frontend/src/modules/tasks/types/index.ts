import type { SubTask, Task } from '~/types/app';

export interface TasksCustomEventMap {
  changeTaskState: CustomEvent<{ taskId: string; state: TaskStates }>;
  changeSubTaskState: CustomEvent<{ taskId: string; state: TaskStates | 'removeEditing' }>;
  toggleTaskCard: CustomEvent<{ taskId: string; clickTarget: HTMLElement }>;
  toggleSelectTask: CustomEvent<{ selected: boolean; taskId: string }>;
  taskOperation: CustomEvent<TaskQueryInfo & { projectId: string }>;
  taskTableOperation: CustomEvent<TaskQueryInfo>;
}

export type TaskStates = 'folded' | 'editing' | 'expanded' | 'unsaved';

export interface TaskStatesChangeEvent extends Event {
  detail: { taskId: string; state: TaskStates };
}

export type TaskQueryActions = 'create' | 'update' | 'delete' | 'createSubTask' | 'updateSubTask' | 'deleteSubTask';

export type TaskQueryInfo = {
  array: Task[] | SubTask[] | { id: string }[];
  action: TaskQueryActions;
};

export interface TaskCardFocusEvent extends Event {
  detail: {
    taskId: string;
    clickTarget: HTMLElement;
  };
}

export interface TaskOperationEvent extends Event {
  detail: TaskQueryInfo & { projectId: string };
}

export interface TaskTableOperationEvent extends Event {
  detail: TaskQueryInfo;
}

export interface TaskCardToggleSelectEvent extends Event {
  detail: {
    taskId: string;
    selected: boolean;
  };
}
