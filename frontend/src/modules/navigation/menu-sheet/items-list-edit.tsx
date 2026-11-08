import { useMountedState } from '~/hooks/use-mounted-state';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetDraggableItem } from '~/modules/navigation/menu-sheet/draggable-item';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { MenuSheetNoItems } from '~/modules/navigation/menu-sheet/items-list';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';

interface MenuSheetItemsListEditProps {
  items: UserMenuItem[];
  options?: MenuSectionOptions;
  isHidden: boolean;
  /** Runs before a row of this list is hidden; true when the row has to wait for the hidden list it moves into to open. */
  prepareHide?: () => boolean;
  isSubmenu?: boolean;
}

export function MenuSheetItemsListEdit({ items, isHidden, options, prepareHide, isSubmenu = false }: MenuSheetItemsListEditProps) {
  // A row that mounts once the list is on screen arrived by a show or a create, and unfolds its submenu
  const { hasStarted: isShown } = useMountedState();

  if (options && items.length === 0) return <MenuSheetNoItems entityType={options.entityType} />;

  const filteredItems = sortAndFilterMenu(items, isHidden);

  return filteredItems.map((item) => (
    <MenuSheetDraggableItem
      key={item.id}
      {...{ item, options, prepareHide }}
      siblings={filteredItems}
      listItems={items}
      isSubitem={isSubmenu}
      isArriving={isShown}
    />
  ));
}
