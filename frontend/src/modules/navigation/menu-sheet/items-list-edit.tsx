import { useState } from 'react';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetDraggableItem } from '~/modules/navigation/menu-sheet/draggable-item';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { MenuSheetNoItems } from '~/modules/navigation/menu-sheet/items-list';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { useNavigationStore } from '~/modules/navigation/navigation-store';

interface MenuSheetItemsListEditProps {
  items: UserMenuItem[];
  options?: MenuSectionOptions;
  isArchived: boolean;
}

export function MenuSheetItemsListEdit({ items, isArchived, options }: MenuSheetItemsListEditProps) {
  const detailedMenu = useNavigationStore((state) => state.detailedMenu);
  const [submenuArchivedVisible, setSubmenuArchivedVisible] = useState<Record<string, boolean>>({});

  if (options && items.length === 0) return <MenuSheetNoItems entityType={options.entityType} />;

  const filteredItems = sortAndFilterMenu(items, isArchived);

  const toggleSubmenuArchived = (itemId: string) => {
    setSubmenuArchivedVisible((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  return filteredItems.map((item) => (
    <MenuSheetDraggableItem
      key={item.id}
      siblings={filteredItems}
      item={item}
      options={options}
      isArchived={isArchived}
      detailedMenu={detailedMenu}
      isSubmenuArchivedVisible={submenuArchivedVisible[item.id]}
      onToggleSubmenuArchived={toggleSubmenuArchived}
    />
  ));
}
