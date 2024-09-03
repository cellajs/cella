import type { DraggableItemData, PageDraggableItemData, SubTaskDraggableItemData, TaskDraggableItemData } from '~/lib/drag-and-drop/types';
import type { Entity } from '~/types';

// creating item data for DnD
export const getDraggableItemData = <T>(
  item: T,
  itemOrder: number,
  type: 'task' | 'menuItem' | 'subTask',
  itemType: Entity,
): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};

export const isTaskData = (data: Record<string | symbol, unknown>): data is TaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'task';
};
export const isSubTaskData = (data: Record<string | symbol, unknown>): data is SubTaskDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'subTask';
};
export const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'menuItem';
};
