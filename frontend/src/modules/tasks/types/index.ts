export interface TasksCustomEventMap {
  changeTaskState: CustomEvent<TaskStateInfo>;
  changeSubtaskState: CustomEvent<{ taskId: string; state: TaskStates | 'removeEditing' }>;
  toggleSelectTask: CustomEvent<TaskSelectInfo>;
}

type TaskStateInfo = {
  taskId: string;
  state: TaskStates;
};

type TaskSelectInfo = {
  taskId: string;
  selected: boolean;
};

export type TaskStates = 'folded' | 'editing' | 'expanded' | 'unsaved';

export interface TaskStatesChangeEvent extends Event {
  detail: TaskStateInfo;
}

export interface TaskCardToggleSelectEvent extends Event {
  detail: TaskSelectInfo;
}
