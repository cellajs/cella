import type { EntityType } from 'shared';

export type DraggableItemData<T, D extends string> = {
  type: D;
  item: T;
  itemType: EntityType;
  dragItem: true;
  displayOrder: number;
};

export const getDraggableItemData = <T, D extends string>(
  item: T,
  itemOrder: number,
  type: D,
  itemType: EntityType,
): DraggableItemData<T, D> => {
  return { dragItem: true, item, displayOrder: itemOrder, type, itemType };
};
