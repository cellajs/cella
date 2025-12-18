import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import type { ContextEntityType } from 'config';
import type { UserMenu } from '~/modules/me/types';
import { sortAndFilterMenu } from './sort-and-filter-menu';

/**
 * Calculates the relative order position for a dragged item based on its drop location.
 *
 * @param data - The user menu data containing all menu items and submenus
 * @param entityType - The type of context entity (organization, workspace, etc.)
 * @param archived - Whether to filter for archived items
 * @param itemId - The ID of the item being dragged
 * @param itemOrder - The current order value of the item
 * @param edge - The drop edge ('top' or 'bottom'), or null
 * @returns The new order value for the item
 */
export const getRelativeItemOrder = (
  data: UserMenu,
  entityType: ContextEntityType,
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
