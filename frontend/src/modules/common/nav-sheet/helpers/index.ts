import type { ContextEntity, UserMenu, UserMenuItem } from '~/types/common';

const sortAndFilterMenu = (data: UserMenuItem[], entityType: ContextEntity, archived: boolean) => {
  const menuList = data
    //filter by type and archive state
    .filter((el) => el.entity === entityType && el.membership.archived === archived)
    // sort items by order
    .sort((a, b) => a.membership.order - b.membership.order);
  return menuList;
};

export const findRelatedItemsByType = (data: UserMenu, entityType: ContextEntity, archived: boolean) => {
  const flatData = Object.values(data).flat();
  const items = sortAndFilterMenu(flatData, entityType, archived);
  if (items.length) return items;

  const subItemsMenu = flatData.flatMap((el) => el.submenu || []);
  const subItems = sortAndFilterMenu(subItemsMenu, entityType, archived);
  return subItems.length ? subItems : [];
};
