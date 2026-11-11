import { settledAfterMountMs, useDelayedFlag } from '~/hooks/use-delayed-flag';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetDraggableItem } from '~/modules/navigation/menu-sheet/draggable-item';
import { type MenuGroup, sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { MenuSheetNoItems } from '~/modules/navigation/menu-sheet/items-list';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';

interface MenuSheetItemsListEditProps {
  items: UserMenuItem[];
  options?: MenuSectionOptions;
  group: MenuGroup;
  /** Runs before a row of this list is hidden; true when the row has to wait for the hidden list it moves into to open. */
  prepareHide?: () => boolean;
  isSubmenu?: boolean;
}

export function MenuSheetItemsListEdit({ items, group, options, prepareHide, isSubmenu = false }: MenuSheetItemsListEditProps) {
  // A row that mounts once the list is on screen arrived by a show or a create, and unfolds its submenu
  const isShown = useDelayedFlag(true, settledAfterMountMs);

  if (options && items.length === 0) return <MenuSheetNoItems entityType={options.entityType} />;

  const filteredItems = sortAndFilterMenu(items, group);

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
