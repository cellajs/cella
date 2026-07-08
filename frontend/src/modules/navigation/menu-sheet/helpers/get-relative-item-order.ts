import type { Edge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/dist/types/types';
import type { ContextEntityType } from 'shared';
import { getRelativeOrder } from 'shared/utils/display-order';
import type { UserMenu } from '~/modules/me/types';
import { sortAndFilterMenu } from './sort-and-filter-menu';

/**
 * Calculates the relative order position for a dragged item based on its drop location.
 *
 * @param data - The user menu data containing all menu items and submenus
 * @param entityType - The type of context entity (organization, workspace, etc.)
 * @param archived - Whether to filter for archived items
 * @param itemId - The ID of the item being dragged
 * @param targetOrder - The displayOrder of the drop target
 * @param edge - The drop edge ('top' or 'bottom'), or null
 * @returns The new order value for the item
 */
export const getRelativeItemOrder = (
  data: UserMenu,
  entityType: ContextEntityType,
  archived: boolean,
  itemId: string,
  targetOrder: number,
  edge: Edge | null,
) => {
  const flatData = Object.values(data).flat();

  // Sort and filter main menu items
  const items = sortAndFilterMenu(flatData, entityType, archived);

  // If no main menu items found, check submenu for the given itemId
  let neededItems = items;
  if (!items.length) {
    const parentMenu = flatData.find((el) => el.submenu?.some((subEl) => subEl.id === itemId));
    if (parentMenu) neededItems = sortAndFilterMenu(parentMenu.submenu ?? [], entityType, archived);
  }

  // Map to the shape expected by the shared helper
  const ordered = neededItems.map((item) => ({ id: item.id, displayOrder: item.membership.displayOrder }));

  return getRelativeOrder(ordered, targetOrder, itemId, edge === 'top' ? 'top' : 'bottom');
};
