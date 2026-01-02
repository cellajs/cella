import type { PageDraggableItemData } from '~/modules/navigation/types';

/**
 * Type guard to check if data is a valid PageDraggableItemData object.
 *
 * @param data - The data object to check
 * @returns True if the data is a PageDraggableItemData, false otherwise
 */
export const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'menuItem';
};
