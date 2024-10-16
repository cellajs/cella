import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import type { ContextEntity, UserMenu, UserMenuItem } from '~/types/common';

const sortAndFilterMenu = (data: UserMenuItem[], entityType: ContextEntity, archived: boolean, reverse = false): UserMenuItem[] => {
  return (
    data
      //filter by type and archive state
      .filter((el) => el.entity === entityType && el.membership.archived === archived)
      .sort((a, b) => {
        // sort items by order
        const orderA = a.membership?.order ?? 0; // Fallback to 0 if order is missing
        const orderB = b.membership?.order ?? 0;
        return reverse ? orderB - orderA : orderA - orderB;
      })
  );
};

export const getRelativeItemOrder = (
  data: UserMenu,
  entityType: ContextEntity,
  archived: boolean,
  itemId: string,
  itemOrder: number,
  edge: Edge | null,
) => {
  const isEdgeTop = edge === 'top';
  const flatData = Object.values(data).flat();

  // Sort and filter main menu items
  const items = sortAndFilterMenu(flatData, entityType, archived, isEdgeTop);

  // If no main menu items found, check submenu for the given itemId
  let neededItems = items;
  if (!items.length) {
    const parentMenu = flatData.find((el) => el.submenu?.some((subEl) => subEl.id === itemId));
    if (parentMenu) neededItems = sortAndFilterMenu(parentMenu.submenu ?? [], entityType, archived, isEdgeTop);
  }
  // Find the relative item based on the item's position and the edge (top or bottom)
  const relativeItem = neededItems.find(({ membership }) => (isEdgeTop ? membership.order < itemOrder : membership.order > itemOrder));

  let newOrder: number;

  // Compute the new order based on the conditions
  if (!relativeItem || relativeItem.membership.order === itemOrder) newOrder = orderChange(itemOrder, isEdgeTop ? 'dec' : 'inc');
  else if (relativeItem.id === itemId) newOrder = relativeItem.membership.order;
  else newOrder = (relativeItem.membership.order + itemOrder) / 2;

  return newOrder;
};

export const orderChange = (order: number, action: 'inc' | 'dec') => {
  if (action === 'inc') {
    if (Number.isInteger(order)) return order + 1;
    return Math.ceil(order);
  }

  if (order > 1 && Number.isInteger(order)) return order - 1;
  return order / 2;
};
