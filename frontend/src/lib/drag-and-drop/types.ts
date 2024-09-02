import type { Entity, SubTask, Task, UserMenuItem } from '~/types';

export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: Entity;
  dragItem: true;
  order: number;
};

export type TaskDraggableItemData = DraggableItemData<Task> & { type: 'task' };
export type SubTaskDraggableItemData = DraggableItemData<SubTask> & { type: 'subTask' };
export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };
