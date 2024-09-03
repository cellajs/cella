import type { ContextEntity, UserMenu, UserMenuItem } from '~/types';

const sortAndFilterMenu = (data: UserMenuItem[], entityType: ContextEntity) => {
  const menuList = data
    //filter by type and archive state
    .filter((el) => el.entity === entityType && !el.membership.archived)
    // sort items by order
    .sort((a, b) => a.membership.order - b.membership.order);
  return menuList;
};

export const findRelatedItemsByType = (data: UserMenu, entityType: ContextEntity) => {
  const flatData = Object.values(data).flat();
  const items = sortAndFilterMenu(flatData, entityType);
  if (items.length) return items;

  const subItemsMenu = flatData.flatMap((el) => el.submenu || []);
  const subItems = sortAndFilterMenu(subItemsMenu, entityType);
  return subItems.length ? subItems : [];
};
