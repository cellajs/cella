import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import type { ContextEntity, UserMenu, UserMenuItem } from '~/types/common';

const sortAndFilterMenu = (data: UserMenuItem[], entityType: ContextEntity, archived: boolean) => {
  const menuList = data
    //filter by type and archive state
    .filter((el) => el.entity === entityType && el.membership.archived === archived)
    // sort items by order
    .sort((a, b) => a.membership.order - b.membership.order);
  return menuList;
};
export const getRelativeItem = (data: UserMenu, entityType: ContextEntity, archived: boolean, itemId: string, edge: Edge | null) => {
  const flatData = Object.values(data).flat();
  const items = sortAndFilterMenu(flatData, entityType, archived);
  let neededItems = items;

  // If no items found, look into submenu
  if (!items.length) {
    const subItemsMenu = flatData.flatMap((el) => el.submenu || []);
    const subItems = sortAndFilterMenu(subItemsMenu, entityType, archived);
    neededItems = subItems.length ? subItems : [];
  }

  // Get the relative item from the neededItems
  const targetItemIndex = neededItems.findIndex((i) => i.id === itemId);
  const relativeItemIndex = edge === 'top' ? targetItemIndex - 1 : targetItemIndex + 1;

  return neededItems[relativeItemIndex];
};

export const orderChange = (order: number, action: 'inc' | 'dec') => {
  if (action === 'inc') {
    if (Number.isInteger(order)) return order + 1;
    return Math.ceil(order);
  }

  if (order > 1 && Number.isInteger(order)) return order - 1;
  return order / 2;
};
