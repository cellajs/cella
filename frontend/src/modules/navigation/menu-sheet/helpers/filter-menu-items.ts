import { appConfig } from 'shared';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';

/**
 * Filters menu items by search term, matching against item names.
 * Recursively searches through submenus.
 */
export const filterMenuItems = (menu: UserMenu, searchTerm: string): UserMenuItem[] => {
  if (!searchTerm.trim()) return [];

  const lowerCaseTerm = searchTerm.toLowerCase();

  const filterItems = (items: UserMenuItem[]): UserMenuItem[] =>
    items.flatMap((item) => {
      const isMatch = item.name.toLowerCase().includes(lowerCaseTerm);
      const filteredSubmenu = item.submenu ? filterItems(item.submenu) : [];
      return isMatch ? [item, ...filteredSubmenu] : filteredSubmenu;
    });

  return appConfig.menuStructure.flatMap(({ entityType }) => filterItems(menu[entityType]));
};
