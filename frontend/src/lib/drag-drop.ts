import type { DraggableItemData, Entity } from '~/types/common';

// Add your app-specific types to handle monitor events
type ItemsType = 'menuItem' | 'task' | 'subTask';

// creating item data for draggable items
export const getDraggableItemData = <T>(item: T, itemOrder: number, type: ItemsType, itemType: Entity): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};
