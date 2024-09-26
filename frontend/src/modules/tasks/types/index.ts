import type { SubTask, Task } from '~/types/app';

export interface TasksCustomEventMap {
  changeTaskState: CustomEvent<{ taskId: string; state: TaskStates }>;
  focusedProjectChange: CustomEvent<string>;
  toggleCreateTaskForm: CustomEvent<string>;
  focusedTaskChange: CustomEvent<{ taskId: string; direction: number; projectId: string }>;
  toggleTaskCard: CustomEvent<{ taskId: string; clickTarget: HTMLElement }>;
  changeSubTaskState: CustomEvent<{ taskId: string; state: TaskStates | 'removeEditing' }>;
  toggleSelectTask: CustomEvent<{ selected: boolean; taskId: string }>;
  openTaskCardPreview: CustomEvent<string>;
  taskTableOperation: CustomEvent<TaskQueryInfo>;
  taskOperation: CustomEvent<TaskQueryInfo & { projectId: string }>;
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

export interface TaskChangeEvent extends Event {
  detail: {
    taskId: string;
    projectId: string;
    direction: number;
  };
}

export interface TaskEditToggleEvent extends Event {
  detail: {
    id: string;
    state: boolean;
  };
}

export interface CustomEventDetailId extends Event {
  detail: string;
}
