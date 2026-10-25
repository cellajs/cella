import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect, useRef, useState } from 'react';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedToggle } from '~/modules/navigation/menu-sheet/archived-toggle';
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';
import { MenuSheetItemEdit } from '~/modules/navigation/menu-sheet/item-edit';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { getDraggableItemData } from '~/utils/get-draggable-item-data';

interface MenuSheetDraggableItemProps {
  item: UserMenuItem;
  siblings: UserMenuItem[];
  isArchived: boolean;
  detailedMenu: boolean;
  options?: MenuSectionOptions;
  isSubmenuArchivedVisible?: boolean;
  onToggleSubmenuArchived: (id: string) => void;
}

export function MenuSheetDraggableItem({
  item,
  siblings,
  isArchived,
  options,
  isSubmenuArchivedVisible = false,
  detailedMenu,
  onToggleSubmenuArchived,
}: MenuSheetDraggableItemProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);

  const canDropItem = (sourceData: Record<string | symbol, unknown>) =>
    isMenuItemDragData(sourceData) &&
    sourceData.item.id !== item.id &&
    sourceData.itemType === item.entityType &&
    siblings.some((sibling) => sibling.id === sourceData.item.id);

  useEffect(() => {
    const element = dragRef.current;
    if (!element) return;
    const data = getDraggableItemData(item, item.membership.displayOrder, 'menuItem', item.entityType);
    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => !item.membership.archived,
        getInitialData: () => data,
        onDrop: () => followReorderFocus(item.id),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => canDropItem(source.data),
        getIsSticky: () => true,
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDrop: () => setClosestEdge(null),
        onDragLeave: () => setClosestEdge(null),
      }),
    );
  }, [item, siblings]);

  const archivedSubitemCount = item.submenu?.filter((sub) => sub.membership.archived).length ?? 0;

  return (
    <li className="relative my-1">
      <div ref={dragRef}>
        <MenuSheetItemEdit item={item} siblings={siblings} icon={options?.icon} />
        {!item.membership.archived && !!item.submenu?.length && detailedMenu && (
          <div
            data-has-archived={!!archivedSubitemCount}
            data-submenu={true}
            data-archived-visible={isSubmenuArchivedVisible}
            className="group/archived"
          >
            <ul>
              <MenuSheetItemsListEdit items={item.submenu} isArchived={isArchived} />
            </ul>
            <MenuSheetArchivedToggle onToggle={() => onToggleSubmenuArchived(item.id)} archivedCount={archivedSubitemCount} />
            {isSubmenuArchivedVisible && (
              <ul>
                <MenuSheetItemsListEdit items={item.submenu} isArchived={true} />
              </ul>
            )}
          </div>
        )}
      </div>
      {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} gap={0.35} />}
    </li>
  );
}
