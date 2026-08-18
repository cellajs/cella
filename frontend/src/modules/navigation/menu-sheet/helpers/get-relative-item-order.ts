import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import type { ChannelEntityType } from 'shared';
import { getRelativeOrder } from 'shared/utils/display-order';
import type { UserMenu } from '~/modules/me/types';
import { sortAndFilterMenu } from './sort-and-filter-menu';

/** Computes the new displayOrder for a dragged item from its drop target and edge. */
export const getRelativeItemOrder = (
  data: UserMenu,
  entityType: ChannelEntityType,
  archived: boolean,
  itemId: string,
  targetOrder: number,
  edge: Edge | null,
) => {
  const flatData = Object.values(data).flat();

  const items = sortAndFilterMenu(flatData, entityType, archived);

  let neededItems = items;
  if (!items.length) {
    const parentMenu = flatData.find((el) => el.submenu?.some((subEl) => subEl.id === itemId));
    if (parentMenu) neededItems = sortAndFilterMenu(parentMenu.submenu ?? [], entityType, archived);
  }

  const ordered = neededItems.map((item) => ({ id: item.id, displayOrder: item.membership.displayOrder }));

  return getRelativeOrder(ordered, targetOrder, itemId, edge === 'top' ? 'top' : 'bottom');
};
