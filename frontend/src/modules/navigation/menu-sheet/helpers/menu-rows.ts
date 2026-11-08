import { hierarchy, isChannelArchivable } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { MenuItemDragData } from '~/modules/navigation/types';

/** The items in one archive state, in display order. */
export const sortAndFilterMenu = (items: UserMenuItem[], archived: boolean): UserMenuItem[] =>
  items.filter((item) => item.membership.archived === archived).sort((a, b) => a.membership.displayOrder - b.membership.displayOrder);

/** Whether a menu row's submenu shows below it: the row is active and has sub-rows. */
export const isSubmenuShown = (item: UserMenuItem): item is UserMenuItem & { submenu: UserMenuItem[] } =>
  !item.membership.archived && !!item.submenu?.length;

/** Whether a row's archived sub-rows show, closed until opened and remembered per row across edit mode and sheet openings. */
export function useSubmenuArchivedOpen(itemId: string) {
  const sectionKey = `${itemId}-archived`;
  const isOpen = useNavigationStore((state) => state.activeSections?.[sectionKey] ?? false);
  const setSectionOpen = useNavigationStore((state) => state.setSectionOpen);

  return [isOpen, (open: boolean) => setSectionOpen(sectionKey, open)] as const;
}

/** A row moves when it has a sibling to pass or the Archived row to cross. */
export const canMove = (item: UserMenuItem, siblings: UserMenuItem[]) => siblings.length > 1 || isChannelArchivable(item.entityType);

const productHomeChannelTypes = new Set(hierarchy.productTypes.flatMap((type) => hierarchy.possibleHomeChannels(type)));

/** Mute is read on a row's home channel only and reaches no channel below, so a channel that homes no product has nothing to mute. */
export const canMute = (item: UserMenuItem) => productHomeChannelTypes.has(item.entityType);

export const isMenuItemDragData = (data: Record<string | symbol, unknown>): data is MenuItemDragData =>
  data.dragItem === true && typeof data.displayOrder === 'number' && data.type === 'menuItem';

/** The data of a drop on an Archived row. */
export const archivedDropData = { menuArchivedToggle: true };

export const isArchivedDropData = (data: Record<string | symbol, unknown>) => data.menuArchivedToggle === true;
