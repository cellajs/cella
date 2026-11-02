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
  /** Runs before a row of this list is archived; true when the row has to wait for the archived list it moves into to open. */
  prepareArchive?: () => boolean;
  /** It lists a row's submenu, so its rows render as sub-rows. */
  isSubmenu?: boolean;
}

export function MenuSheetItemsListEdit({ items, isArchived, options, prepareArchive, isSubmenu = false }: MenuSheetItemsListEditProps) {
  // A row that mounts once the list is on screen arrived by a restore or a create, and unfolds its submenu
  const { hasStarted: isShown } = useMountedState();

  if (options && items.length === 0) return <MenuSheetNoItems entityType={options.entityType} />;

  const filteredItems = sortAndFilterMenu(items, isArchived);

  return filteredItems.map((item) => (
    <MenuSheetDraggableItem
      key={item.id}
      siblings={filteredItems}
      listItems={items}
      item={item}
      isSubitem={isSubmenu}
      options={options}
      isArriving={isShown}
      prepareArchive={prepareArchive}
    />
  ));
}
