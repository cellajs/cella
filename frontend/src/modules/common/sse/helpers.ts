import type { UserMenuItem } from '~/types';
import { useNavigationStore } from '~/store/navigation';

export const addMenuItem = (newEntity: UserMenuItem) => {
  const menu = useNavigationStore.getState().menu;

  const add = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (item.id === newEntity.parentId && item.submenu) {
        return {
          ...item,
          submenu: [...item.submenu, newEntity],
        };
      }
      if (item.submenu) {
        return {
          ...item,
          submenu: add(item.submenu),
        };
      }
      return item;
    });
  };

  return {
    organizations: add(menu.organizations),
    workspaces: add(menu.workspaces),
  };
};

export const updateMenuItem = (updatedEntity: UserMenuItem) => {
  const menu = useNavigationStore.getState().menu;

  const update = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (item.id === updatedEntity.id) {
        return {
          ...item,
          ...updatedEntity,
          membership: {
            ...item.membership,
            ...updatedEntity.membership,
          },
        };
      }
      if (item.submenu) {
        return {
          ...item,
          submenu: update(item.submenu),
        };
      }
      return item;
    });
  };
  return {
    organizations: update(menu.organizations),
    workspaces: update(menu.workspaces),
  };
};

export const deleteMenuItem = (itemId: string) => {
  const menu = useNavigationStore.getState().menu;

  const remove = (items: UserMenuItem[]): UserMenuItem[] => {
    const updatedItems: UserMenuItem[] = [];
    for (const item of items) {
      if (item.id !== itemId) {
        const updatedItem: UserMenuItem = { ...item };
        if (item.submenu) updatedItem.submenu = remove(item.submenu);
        updatedItems.push(updatedItem);
      }
    }
    return updatedItems;
  };

  return {
    organizations: remove(menu.organizations),
    workspaces: remove(menu.workspaces),
  };
};
