import type { Entity } from 'config';
import type { DraggableItemType } from '~/types/app';

// Drag and drop data
export type DraggableItemData<T> = {
  type: string;
  item: T;
  itemType: Entity;
  dragItem: true;
  order: number;
};

/**
 * Creates data for draggable items to be used in a drag-and-drop interface.
 *
 * The function returns an object that contains information necessary for identifying
 * and managing the draggable item in a DnD scenario, including the item
 * itself, its order, and its type.
 *
 * @param item - Item to be dragged.
 * @param itemOrder - Order of item in list or collection.
 * @param type - Type of the draggable item.
 * @param itemType - Entity type of the item.
 *
 * @returns An object containing the item data for DnD functionality.
 */
export const getDraggableItemData = <T>(item: T, itemOrder: number, type: DraggableItemType, itemType: Entity): DraggableItemData<T> => {
  return { dragItem: true, item, order: itemOrder, type, itemType: itemType };
};
