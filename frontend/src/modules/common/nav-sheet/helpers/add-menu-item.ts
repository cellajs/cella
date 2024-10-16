import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

// Adding new item on local store user's menu
export const addMenuItem = (newEntity: UserMenuItem, sectionName: keyof UserMenu, parentSlug?: string) => {
  const menu = useNavigationStore.getState().menu;

  const add = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (!parentSlug || item.slug !== parentSlug) return item;

      // If parent is found, add new entity to its submenu
      return {
        ...item,
        submenu: item.submenu ? [...item.submenu, newEntity] : [newEntity],
      };
    });
  };

  const updatedMenuSection = parentSlug ? add(menu[sectionName]) : [...menu[sectionName], newEntity];

  return {
    ...menu,
    [sectionName]: updatedMenuSection,
  };
};
