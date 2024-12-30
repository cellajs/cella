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

  // If no relative item found, return new order based on edge
  if (!relativeItem || relativeItem.membership.order === itemOrder) {
    return Math.floor(itemOrder) + (isEdgeTop ? -10 : 10);
  }
  // If relative item is same as item, return item's order
  if (relativeItem.id === itemId) return relativeItem.membership.order;

  // Put the new item in the middle of two items
  return (relativeItem.membership.order + itemOrder) / 2;
};
