import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

// Adding new item on local store user's menu
export const addMenuItem = (newEntity: UserMenuItem, storage: keyof UserMenu) => {
  const menu = useNavigationStore.getState().menu;

  // TODO: Do we still need parentId?
  const add = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (item.id === newEntity.parentId) {
        return {
          ...item,
          submenu: item.submenu ? [...item.submenu, newEntity] : [newEntity],
        };
      }
      return item;
    });
  };

  const updatedStorage = newEntity.parentId ? add(menu[storage]) : [...menu[storage], newEntity];

  return {
    ...menu,
    [storage]: updatedStorage,
  };
};
