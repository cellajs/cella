import { useState } from 'react';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetDraggableItem } from '~/modules/navigation/menu-sheet/draggable-item';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { MenuSheetNoItems } from '~/modules/navigation/menu-sheet/items-list';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';

interface MenuSheetItemsListEditProps {
  items: UserMenuItem[];
  options?: MenuSectionOptions;
  isArchived: boolean;
  /** Runs before a row of this list is archived; true when it had to open the archived list the row moves into. */
  onArchive?: () => boolean;
  /** It lists a row's submenu, so its rows render as sub-rows. */
  isSubmenu?: boolean;
}

export function MenuSheetItemsListEdit({ items, isArchived, options, onArchive, isSubmenu = false }: MenuSheetItemsListEditProps) {
  const [submenuArchivedVisible, setSubmenuArchivedVisible] = useState<Record<string, boolean>>({});
  // A row that mounts once the list is on screen arrived by a restore or a create, and unfolds its submenu
  const { hasStarted: isShown } = useMountedState();

  if (options && items.length === 0) return <MenuSheetNoItems entityType={options.entityType} />;

  const filteredItems = sortAndFilterMenu(items, isArchived);

  const setSubmenuArchivedOpen = (itemId: string, open: boolean) => {
    setSubmenuArchivedVisible((prev) => ({ ...prev, [itemId]: open }));
  };

  return filteredItems.map((item) => (
    <MenuSheetDraggableItem
      key={item.id}
      siblings={filteredItems}
      item={item}
      isSubitem={isSubmenu}
      options={options}
      isArchived={isArchived}
      isArriving={isShown}
      isSubmenuArchivedVisible={submenuArchivedVisible[item.id]}
      onSubmenuArchivedChange={setSubmenuArchivedOpen}
      onArchive={onArchive}
    />
  ));
}
