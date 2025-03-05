import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { useNavigationStore } from '~/store/navigation';
import { entityRelations } from '#/entity-config';

const useTransformOnMenuItems = (transform: (items: UserMenuItem[]) => UserMenuItem[]) => {
  const { menu } = useNavigationStore.getState();

  const updatedMenu = entityRelations.reduce(
    (acc, { menuSectionName }) => {
      if (menu[menuSectionName]) acc[menuSectionName] = transform(menu[menuSectionName]);
      return acc;
    },
    {} as Record<keyof UserMenu, UserMenuItem[]>,
  );
  useNavigationStore.setState({ menu: updatedMenu });
};

/**
 * Adds a new menu item to the user's navigation menu.
 * If the `parentSlug` is provided, the new item will be added under the parent menu item.
 *
 * @param newEntity - New menu item to be added.
 * @param sectionName - Name of section in the menu where the item will be added.
 * @param parentSlug - Slug of the parent item, if the new item should be a submenu (optional).
 */
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

  useNavigationStore.setState({
    menu: {
      ...menu,
      [sectionName]: updatedMenuSection,
    },
  });
};

/**
 * Updates an existing menu item with new properties.
 *
 * @param updatedEntity - Menu item with updated properties.
 * @returns Transformed menu with  updated item.
 */
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

/**
 * Deletes a menu item from the user's navigation menu.
 *
 * @param itemId - ID of the menu item to be deleted.
 * @returns Transformed menu with the item removed.
 */
export const deleteMenuItem = (itemId: string) => {
  const remove = (items: UserMenuItem[]): UserMenuItem[] =>
    items
      .filter((item) => item.id !== itemId && item.organizationId !== itemId)
      .map((item) => (item.submenu ? { ...item, submenu: remove(item.submenu) } : item));

  return useTransformOnMenuItems(remove); // use remove on every menu item by storage type from menu config
};
