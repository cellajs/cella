import type { PageDraggableItemData } from '~/modules/navigation/types';

export const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.displayOrder === 'number' && data.type === 'menuItem';
};
