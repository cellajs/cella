import type { UserMenu, UserMenuItem } from '~/modules/me/types';

/** The menu's organizations, archived ones included, whichever menu section lists them. */
export const menuOrganizations = (menu: UserMenu): UserMenuItem[] =>
  Object.values(menu).flatMap((items) => items.filter((item) => item.entityType === 'organization'));
