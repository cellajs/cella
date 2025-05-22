import type { EntityType } from 'config';

// Drag and drop data
export type DraggableItemData<T, D extends string> = {
  type: D;
  item: T;
  itemType: EntityType;
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
export const getDraggableItemData = <T, D extends string>(item: T, itemOrder: number, type: D, itemType: EntityType): DraggableItemData<T, D> => {
  return { dragItem: true, item, order: itemOrder, type, itemType };
};
