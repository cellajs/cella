import type { UserMenuItem } from '~/modules/me/types';

/** Whether a menu row's submenu shows below it: the row is active, has sub-rows and the detailed menu is on. */
export const isSubmenuShown = (item: UserMenuItem, detailedMenu: boolean): item is UserMenuItem & { submenu: UserMenuItem[] } =>
  !item.membership.archived && !!item.submenu?.length && detailedMenu;
