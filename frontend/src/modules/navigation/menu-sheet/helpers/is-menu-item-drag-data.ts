import type { MenuItemDragData } from '~/modules/navigation/types';

export const isMenuItemDragData = (data: Record<string | symbol, unknown>): data is MenuItemDragData => {
  return data.dragItem === true && typeof data.displayOrder === 'number' && data.type === 'menuItem';
};
