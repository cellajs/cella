import type { ContextEntityType } from 'config';
import type { UserMenuItem } from '~/modules/me/types';

/**
 * Filters and sorts menu items by entity type and archive state.
 *
 * @param data - The array of menu items to filter and sort
 * @param entityType - The type of context entity to filter by
 * @param archived - Whether to filter for archived or non-archived items
 * @param reverse - Whether to reverse the sort order (default: false)
 * @returns The filtered and sorted array of menu items
 */
export const sortAndFilterMenu = (data: UserMenuItem[], entityType: ContextEntityType, archived: boolean, reverse = false): UserMenuItem[] => {
  return (
    data
      //filter by type and archive state
      .filter((el) => el.entityType === entityType && el.membership.archived === archived)
      .sort((a, b) => {
        // sort items by order
        const orderA = a.membership?.order ?? 0; // Fallback to 0 if order is missing
        const orderB = b.membership?.order ?? 0;
        return reverse ? orderB - orderA : orderA - orderB;
      })
  );
};
