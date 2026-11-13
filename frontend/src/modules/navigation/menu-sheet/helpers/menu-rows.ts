import type { TFunction } from 'i18next';
import { type ChannelEntityType, hierarchy, isChannelHideable } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import type { UserMenuItem } from '~/modules/me/types';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { MenuItemDragData } from '~/modules/navigation/types';

/** The list a menu row shows in: the active rows, or behind the Hidden or the Archived toggle below them. */
export type MenuGroup = 'active' | 'hidden' | 'archived';

/** An archived channel's row is under Archived whether its member hid it or not; else a hidden row is under Hidden. */
export const menuGroup = (item: UserMenuItem): MenuGroup => {
  if (item.archived) return 'archived';
  return item.membership.hidden ? 'hidden' : 'active';
};

/** The items of one group, in display order. */
export const sortAndFilterMenu = (items: UserMenuItem[], group: MenuGroup): UserMenuItem[] =>
  items.filter((item) => menuGroup(item) === group).sort((a, b) => a.membership.displayOrder - b.membership.displayOrder);

/** Whether a menu row's submenu shows below it: the row is not hidden and has sub-rows. */
export const isSubmenuShown = (item: UserMenuItem): item is UserMenuItem & { submenu: UserMenuItem[] } =>
  !item.membership.hidden && !!item.submenu?.length;

/** Whether a row's hidden or archived sub-rows show, closed until opened and remembered per row across edit mode and sheet openings. */
export function useSubmenuGroupOpen(itemId: string, group: Exclude<MenuGroup, 'active'>) {
  const sectionKey = `${itemId}-${group}`;
  const isOpen = useNavigationStore((state) => state.activeSections?.[sectionKey] ?? false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  return [isOpen, (open: boolean) => setSectionOpen(sectionKey, open)] as const;
}

/** A row moves when it has a sibling to pass or the Hidden row to cross; an archived row stays where it is. */
export const canMove = (item: UserMenuItem, siblings: UserMenuItem[]) =>
  !item.archived && (siblings.length > 1 || isChannelHideable(item.entityType));

const productHomeChannelTypes = new Set(hierarchy.productTypes.flatMap((type) => hierarchy.possibleHomeChannels(type)));

/** Mute is read on a row's home channel only and reaches no channel below, so a channel that homes no product has nothing to mute. */
export const canMute = (item: UserMenuItem) => productHomeChannelTypes.has(item.entityType);

/** Whether a row is set compact, as a sub-row or in a `compact` section: read by its name and by the Hidden toggle that folds rows like it. */
export const isCompactRow = (entityType: ChannelEntityType, isSubitem: boolean) => isSubitem || !!getMenuSection(entityType)?.compact;

export const isMenuItemDragData = (data: Record<string | symbol, unknown>): data is MenuItemDragData =>
  data.dragItem === true && typeof data.displayOrder === 'number' && data.type === 'menuItem';

/** The data of a drop on a Hidden row. */
export const hiddenDropData = { menuHiddenToggle: true };

export const isHiddenDropData = (data: Record<string | symbol, unknown>) => data.menuHiddenToggle === true;

/** A folded toggle's accessible name: its label, the rows it lists and what is new in them, "Workspaces, 12, 3 new". Undefined without rows. */
export const foldedToggleLabel = (t: TFunction, label: string, rowCount: number, unseenCount: number) =>
  rowCount
    ? t(unseenCount ? 'c:menu_section_count_unseen' : 'c:menu_section_count', { resource: label, total: rowCount, count: unseenCount })
    : undefined;
