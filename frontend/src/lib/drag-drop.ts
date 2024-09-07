import type { DraggableItemData, Entity } from '~/types';

// creating item data for draggable items
export const getDraggableItemData = <T>(
  item: T,
  itemOrder: number,
  type: 'task' | 'menuItem' | 'subTask',
  itemType: Entity,
): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};
