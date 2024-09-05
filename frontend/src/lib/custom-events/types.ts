import type { SubTask, Task } from '~/types';

export interface CustomEventMap {
  projectChange: CustomEvent<string>;
  taskChange: CustomEvent<{ taskId: string; direction: number; projectId: string }>;
  taskCardClick: CustomEvent<{ taskId: string; clickTarget: HTMLElement }>;
  toggleCard: CustomEvent<string>;
  toggleTaskEditing: CustomEvent<{ state: boolean; id: string }>;
  toggleSelectTask: CustomEvent<{ selected: boolean; taskId: string }>;
  openTaskCardPreview: CustomEvent<string>;
  searchDropDownClose: Event;
  updateUserCover: CustomEvent<string>;
  updateOrganizationCover: CustomEvent<string>;
  updateWorkspaceCover: CustomEvent<string>;
  taskTableCRUD: CustomEvent<{
    array: Task[] | { id: string }[];
    action: TaskQueryActions;
  }>;
  taskCRUD: CustomEvent<{
    array: Task[] | { id: string }[];
    action: TaskQueryActions;
  }>;
}

export type CustomEventsWithData = {
  [K in keyof CustomEventMap as CustomEventMap[K] extends CustomEvent<infer DetailData>
    ? IfAny<DetailData, never, K>
    : never]: CustomEventMap[K] extends CustomEvent<infer DetailData> ? DetailData : never;
};

type IfAny<T, Y, N> = 0 extends 1 & T ? Y : N;

export type TaskQueryActions = 'create' | 'update' | 'delete' | 'createSubTask' | 'updateSubTask' | 'deleteSubTask';

export interface TaskCardFocusEvent extends Event {
  detail: {
    taskId: string;
    clickTarget: HTMLElement;
  };
}

export interface TaskCRUDEvent extends Event {
  detail: {
    array: Task[] | SubTask[] | { id: string }[];
    action: TaskQueryActions;
  };
}

export interface TaskTableCRUDEvent extends Event {
  detail: {
    array: Task[] | SubTask[] | { id: string }[];
    action: TaskQueryActions;
  };
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

export interface CustomEventEventById extends Event {
  detail: string;
}
