import type { UserMenuItem } from '~/modules/me/types';

/** The items in one archive state, in display order. */
export const sortAndFilterMenu = (items: UserMenuItem[], archived: boolean): UserMenuItem[] =>
  items.filter((item) => item.membership.archived === archived).sort((a, b) => a.membership.displayOrder - b.membership.displayOrder);
