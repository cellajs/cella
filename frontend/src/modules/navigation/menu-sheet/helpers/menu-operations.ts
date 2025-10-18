import { appConfig, type ContextEntityType } from 'config';
import type { MembershipBaseSchema } from '~/api.gen';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { useNavigationStore } from '~/store/navigation';

const useTransformOnMenuItems = (transform: (items: UserMenuItem[]) => UserMenuItem[]) => {
  const { menu } = useNavigationStore.getState();

  const updatedMenu = appConfig.menuStructure.reduce(
    (acc, { entityType }) => {
      if (menu[entityType]) acc[entityType] = transform(menu[entityType]);
      return acc;
    },
    {} as Record<keyof UserMenu, UserMenuItem[]>,
  );
  useNavigationStore.setState({ menu: updatedMenu });
};

/**
 * Adds a new menu item to the user's navigation menu.
 * If `attachToIdOrSlug` is provided, the new item will be added
 * under the matching item by id/slug.
 *
 * @param newItem - The new menu item to add.
 * @param attachToIdOrSlug - ID or slug of the item to attach the new one under (optional).
 */
export const addMenuItem = (newItem: UserMenuItem, attachToIdOrSlug?: string) => {
  const { menu } = useNavigationStore.getState();

  // Recursive helper to insert newItem under the correct item
  const insertUnder = (items: UserMenuItem[]): UserMenuItem[] =>
    items.map((item) => {
      if (attachToIdOrSlug && (item.id === attachToIdOrSlug || item.slug === attachToIdOrSlug)) {
        return {
          ...item,
          submenu: [...(item.submenu ?? []), newItem],
        };
      }

      return {
        ...item,
        submenu: item.submenu ? insertUnder(item.submenu) : item.submenu,
      };
    });

  // Find the menu section based on entity type
  const section = appConfig.menuStructure.find((el) => el.entityType === newItem.entityType || el.subentityType === newItem.entityType);
  if (!section) return;

  const { entityType: sectionName } = section;

  const updatedSection = attachToIdOrSlug ? insertUnder(menu[sectionName]) : [...menu[sectionName], { ...newItem, submenu: [] }];

  useNavigationStore.setState({
    menu: {
      ...menu,
      [sectionName]: updatedSection,
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
        const updatedMembership = {
          ...item.membership,
          ...updatedEntity.membership,
        };

        return {
          ...item,
          // Only update fields that exist in item
          ...Object.fromEntries(Object.keys(updatedEntity).map((key) => (key in item ? [key, updatedEntity[key as keyof UserMenuItem]] : []))),
          membership: updatedMembership,
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

  return useTransformOnMenuItems(update); // Use update on every menu item by storage type from menu config
};

/**
 * Updates the membership information of an entity in the navigation menu.
 *
 * @param membershipData - Updated membership details.
 * @param entityIdOrSlug - ID or slug of entity.
 * @param entityType - Context entity type
 */
export const updateMenuItemMembership = (membershipData: Partial<MembershipBaseSchema>, entityIdOrSlug: string, entityType: ContextEntityType) => {
  // Get the current menu state from the navigation store (without using hooks)
  const menu = useNavigationStore.getState().menu;

  // Find section that corresponds to given entity type
  const menuSection = appConfig.menuStructure.find((el) => el.entityType === entityType || el.subentityType === entityType);
  if (!menuSection) return;

  // Select menu entities based on section's entity type
  const menuEntities = menu[menuSection.entityType] || [];

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
    membership: { ...currentEntity.membership, ...membershipData },
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
      .filter((item) => item.id !== itemId && item.membership.organizationId !== itemId)
      .map((item) => (item.submenu ? { ...item, submenu: remove(item.submenu) } : item));

  return useTransformOnMenuItems(remove); // Use remove on every menu item by storage type from menu config
};
