import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import type { ChannelEntityType } from 'shared';
import { getRelativeOrder } from 'shared/utils/display-order';
import type { UserMenu } from '~/modules/me/types';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';

/** Computes the new displayOrder for a dragged item from its drop target and edge. */
export const getRelativeItemOrder = (
  menu: UserMenu,
  entityType: ChannelEntityType,
  archived: boolean,
  itemId: string,
  targetOrder: number,
  edge: Edge | null,
) => {
  const allItems = Object.values(menu).flat();

  const items = sortAndFilterMenu(
    allItems.filter((item) => item.entityType === entityType),
    archived,
  );

  let siblings = items;
  if (!items.length) {
    const parentItem = allItems.find((item) => item.submenu?.some((sub) => sub.id === itemId));
    if (parentItem) siblings = sortAndFilterMenu(parentItem.submenu ?? [], archived);
  }

  const ordered = siblings.map((item) => ({ id: item.id, displayOrder: item.membership.displayOrder }));

  return getRelativeOrder(ordered, targetOrder, itemId, edge === 'top' ? 'top' : 'bottom');
};
