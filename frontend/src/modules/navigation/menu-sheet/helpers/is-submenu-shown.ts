import type { UserMenuItem } from '~/modules/me/types';

/** Whether a menu row's submenu shows below it: the row is active and has sub-rows. */
export const isSubmenuShown = (item: UserMenuItem): item is UserMenuItem & { submenu: UserMenuItem[] } =>
  !item.membership.archived && !!item.submenu?.length;
