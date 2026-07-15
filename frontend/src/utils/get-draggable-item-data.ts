import type { EntityType } from 'shared';

// Drag and drop data
export type DraggableItemData<T, D extends string> = {
  type: D;
  item: T;
  itemType: EntityType;
  dragItem: true;
  displayOrder: number;
};

/** Builds the drag payload for a draggable item, tagged with its order, type, and entity type. */
export const getDraggableItemData = <T, D extends string>(
  item: T,
  itemOrder: number,
  type: D,
  itemType: EntityType,
): DraggableItemData<T, D> => {
  return { dragItem: true, item, displayOrder: itemOrder, type, itemType };
};
