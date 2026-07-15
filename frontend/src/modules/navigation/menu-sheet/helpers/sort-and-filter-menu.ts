import type { ChannelEntityType } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';

/** Filters menu items by entity type and archive state, then sorts them (`reverse` flips the order). */
export const sortAndFilterMenu = (
  data: UserMenuItem[],
  entityType: ChannelEntityType,
  archived: boolean,
  reverse = false,
): UserMenuItem[] => {
  return (
    data
      //filter by type and archive state
      .filter((el) => el.entityType === entityType && el.membership.archived === archived)
      .sort((a, b) => {
        // sort items by displayOrder
        const orderA = a.membership?.displayOrder ?? 0; // Fallback to 0 if displayOrder is missing
        const orderB = b.membership?.displayOrder ?? 0;
        return reverse ? orderB - orderA : orderA - orderB;
      })
  );
};
