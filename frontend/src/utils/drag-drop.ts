import type { Entity } from 'config';

// Drag and drop data
export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: Entity;
  dragItem: true;
  order: number;
};

// Add your app-specific types to handle monitor events
export type DraggableItemType = 'menuItem';

// creating item data for draggable items
export const getDraggableItemData = <T>(item: T, itemOrder: number, type: DraggableItemType, itemType: Entity): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};
