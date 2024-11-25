import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { useEffect, useRef, useState } from 'react';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { MenuArchiveToggle } from '~/modules/common/nav-sheet/menu-archive-toggle';
import { isPageData } from '~/modules/common/nav-sheet/sheet-menu';
import { SheetMenuItemsOptions } from '~/modules/common/nav-sheet/sheet-menu-options';
import { MenuItemOptions } from '~/modules/common/nav-sheet/sheet-menu-options/menu-item-options';
import type { UserMenuItem } from '~/types/common';
import { getDraggableItemData } from '~/utils/drag-drop';

interface ComplexOptionElementProps {
  item: UserMenuItem;
  shownOption: 'archived' | 'unarchive';
  hideSubmenu: boolean;
  isSubmenuArchivedVisible?: boolean;
  toggleSubmenuVisibility: (id: string) => void;
}
export const ComplexOptionElement = ({
  item,
  shownOption,
  isSubmenuArchivedVisible = false,
  hideSubmenu,
  toggleSubmenuVisibility,
}: ComplexOptionElementProps) => {
  const dragRef = useRef(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const handleCanDrop = (sourceData: Record<string | symbol, unknown>) => {
    return isPageData(sourceData) && sourceData.item.id !== item.id && sourceData.itemType === item.entity;
  };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = dragRef.current;
    if (!element) return;
    const data = getDraggableItemData(item, item.membership.order, 'menuItem', item.entity);
    return combine(
      draggable({
        element,
        dragHandle: element,
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
  }, [item]);

  return (
    <div data-submenu={!!item.submenu} className="group/menuOptions relative my-1">
      <div ref={dragRef}>
        <MenuItemOptions item={item} />
        {!item.membership.archived && !!item.submenu?.length && !hideSubmenu && (
          <div
            data-have-inactive={!!item.submenu.filter((i) => i.membership.archived).length}
            data-submenu={true}
            data-archived-visible={isSubmenuArchivedVisible}
            className="group/archived"
          >
            <SheetMenuItemsOptions data={item.submenu} shownOption={shownOption} />
            <MenuArchiveToggle
              archiveToggleClick={() => toggleSubmenuVisibility(item.id)}
              inactiveCount={item.submenu.filter((i) => i.membership.archived).length}
            />
            {isSubmenuArchivedVisible && <SheetMenuItemsOptions data={item.submenu} shownOption="archived" />}
          </div>
        )}
      </div>
      {closestEdge && <DropIndicator className="h-0.5 w-full" edge={closestEdge} gap={0.35} />}
    </div>
  );
};
