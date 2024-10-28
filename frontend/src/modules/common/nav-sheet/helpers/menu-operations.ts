import { menuSections } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenu, UserMenuItem } from '~/types/common';

const useTransformOnMenuItems = (transform: (items: UserMenuItem[]) => UserMenuItem[]) => {
  const { menu } = useNavigationStore.getState();

  const updatedMenu = menuSections.reduce(
    (acc, { name }) => {
      if (menu[name]) acc[name] = transform(menu[name]);
      return acc;
    },
    {} as Record<keyof UserMenu, UserMenuItem[]>,
  );
  useNavigationStore.setState({ menu: updatedMenu });
};

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

  const updatedMenuSection = parentSlug ? add(menu[sectionName]) : [...menu[sectionName], { ...newEntity, submenu: [] }];

  return {
    ...menu,
    [sectionName]: updatedMenuSection,
  };
};

export const updateMenuItem = (updatedEntity: UserMenuItem) => {
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

  return useTransformOnMenuItems(update); // use update on every menu item by storage type from menu config
};

export const deleteMenuItem = (itemId: string) => {
  const remove = (items: UserMenuItem[]): UserMenuItem[] =>
    items
      .filter((item) => item.id !== itemId && item.organizationId !== itemId)
      .map((item) => (item.submenu ? { ...item, submenu: remove(item.submenu) } : item));

  return useTransformOnMenuItems(remove); // use remove on every menu item by storage type from menu config
};
