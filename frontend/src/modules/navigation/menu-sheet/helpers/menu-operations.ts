import type { ContextEntity } from 'config';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import type { MinimumMembershipInfo } from '~/modules/memberships/types';
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
 * If `parentIdOrSlug` is provided, new item will be added under parent menu item.
 *
 * @param newEntity - New menu item to be added.
 * @param sectionName - Name of section in  menu where  item will be added.
 * @param parentIdOrSlug -  ID or Slug of  parent item, if new item should be a submenu (optional).
 */
export const addMenuItem = (newEntity: UserMenuItem, sectionName: keyof UserMenu, parentIdOrSlug?: string) => {
  const menu = useNavigationStore.getState().menu;

  const add = (items: UserMenuItem[]): UserMenuItem[] => {
    return items.map((item) => {
      if (!parentIdOrSlug || item.slug !== parentIdOrSlug || item.id !== parentIdOrSlug) return item;

      // If parent is found, add new entity to its submenu
      return {
        ...item,
        submenu: item.submenu ? [...item.submenu, newEntity] : [newEntity],
      };
    });
  };

  const updatedMenuSection = parentIdOrSlug ? add(menu[sectionName]) : [...menu[sectionName], { ...newEntity, submenu: [] }];

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
 * Updates the membership information of an entity in the navigation menu.
 *
 * @param membershipInfo - Updated membership details.
 * @param entityIdOrSlug - ID or slug of entity.
 * @param entityType - Context entity type
 */
export const updateMenuItemMembership = (
  membershipInfo: Partial<Omit<MinimumMembershipInfo, 'organizationId'>>,
  entityIdOrSlug: string,
  entityType: ContextEntity,
) => {
  // Get the current menu state from the navigation store (without using hooks)
  const menu = useNavigationStore.getState().menu;

  // Find section that corresponds to given entity type
  const menuSection = entityRelations.find((el) => el.entity === entityType || el.subEntity === entityType);
  if (!menuSection) return;

  const { menuSectionName } = menuSection;
  const menuEntities = menu[menuSectionName];

  // Search in menuEntities
  let currentEntity = menuEntities.find((e) => e.id === entityIdOrSlug || e.slug === entityIdOrSlug);

  // Search in menuEntities submenus
  if (!currentEntity) {
    for (const entity of menuEntities) {
      if (!entity.submenu) continue;

      currentEntity = entity.submenu.find((sub) => sub.id === entityIdOrSlug || sub.slug === entityIdOrSlug);
      if (currentEntity) break; // Stop searching once found
    }
  }

  // If not found, in menuEntities and it's submenus return
  if (!currentEntity) return;

  const updatedEntity: UserMenuItem = {
    ...currentEntity,
    membership: { ...currentEntity.membership, ...membershipInfo },
  };

  // Update menu item with new membership data
  updateMenuItem(updatedEntity);
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
