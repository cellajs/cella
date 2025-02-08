import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuItemEdit } from '~/modules/navigation/menu-sheet/item-edit';
import { MenuSheetItemsEdit } from '~/modules/navigation/menu-sheet/items-edit-list';
import { SectionArchiveButton } from '~/modules/navigation/menu-sheet/section-archive-button';
import type { UserMenuItem } from '~/modules/users/types';
import { getDraggableItemData } from '~/utils/drag-drop';

interface MenuItemEditWrapperProps {
  item: UserMenuItem;
  unarchiveItems: UserMenuItem[];
  shownOption: 'archived' | 'unarchive';
  hideSubmenu: boolean;
  isSubmenuArchivedVisible?: boolean;
  toggleSubmenuVisibility: (id: string) => void;
}
export const MenuItemEditWrapper = ({
  item,
  unarchiveItems,
  shownOption,
  isSubmenuArchivedVisible = false,
  hideSubmenu,
  toggleSubmenuVisibility,
}: MenuItemEditWrapperProps) => {
  const dragRef = useRef(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const handleCanDrop = useCallback(
    (sourceData: Record<string | symbol, unknown>) => {
      return (
        isPageData(sourceData) &&
        sourceData.item.id !== item.id &&
        sourceData.itemType === item.entity &&
        unarchiveItems.some((i) => i.id === sourceData.item.id)
      );
    },
    [unarchiveItems],
  );

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = dragRef.current;
    if (!element) return;
    const data = getDraggableItemData(item, item.membership.order, 'menuItem', item.entity);
    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => !item.membership.archived,
        getInitialData: () => data,
      }),
      dropTargetForElements({
        element,
        // allow drop if both have sum menu or both have not
        canDrop: ({ source }) => handleCanDrop(source.data),
        getIsSticky: () => true,
        getData: ({ input }) =>
          attachClosestEdge(data, {
            element,
            input,
            allowedEdges: ['top', 'bottom'],
          }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDrop: () => setClosestEdge(null),
        onDragLeave: () => setClosestEdge(null),
      }),
    );
  }, [item, unarchiveItems]);

  return (
    <li data-submenu={!!item.submenu} className="group/menuOptions relative my-1">
      <div ref={dragRef}>
        <MenuItemEdit item={item} />
        {!item.membership.archived && !!item.submenu?.length && !hideSubmenu && (
          <div
            data-has-inactive={!!item.submenu.filter((i) => i.membership.archived).length}
            data-submenu={true}
            data-archived-visible={isSubmenuArchivedVisible}
            className="group/archived"
          >
            <ul>
              <MenuSheetItemsEdit data={item.submenu} shownOption={shownOption} />
            </ul>
            <SectionArchiveButton
              archiveToggleClick={() => toggleSubmenuVisibility(item.id)}
              inactiveCount={item.submenu.filter((i) => i.membership.archived).length}
            />
            {isSubmenuArchivedVisible && (
              <ul>
                <MenuSheetItemsEdit data={item.submenu} shownOption="archived" />
              </ul>
            )}
          </div>
        )}
      </div>
      {closestEdge && <DropIndicator className="h-0.5 w-full" edge={closestEdge} gap={0.35} />}
    </li>
  );
};
