import type { DraggableItemType } from '~/types/app';
import type { DraggableItemData, Entity } from '~/types/common';

// creating item data for draggable items
export const getDraggableItemData = <T>(item: T, itemOrder: number, type: DraggableItemType, itemType: Entity): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};
