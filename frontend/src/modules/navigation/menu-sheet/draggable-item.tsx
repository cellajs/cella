import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getMenuSection } from '~/lib/entity-modules';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { EntityChip } from '~/modules/common/entity-chip';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import type { UserMenuItem } from '~/modules/me/types';
import { menuListMotion, menuRowLandSeconds } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { canMove, isMenuItemDragData, isSubmenuShown, menuGroup, useSubmenuGroupOpen } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { useMenuRowMoves } from '~/modules/navigation/menu-sheet/helpers/use-menu-row-moves';
import { MenuSheetHiddenGroup } from '~/modules/navigation/menu-sheet/hidden-group';
import { MenuSheetItemEdit } from '~/modules/navigation/menu-sheet/item-edit';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import { cn } from '~/utils/cn';
import { getDraggableItemData } from '~/utils/get-draggable-item-data';

interface MenuSheetDraggableItemProps {
  item: UserMenuItem;
  siblings: UserMenuItem[];
  /** Every row of its list, active, hidden and archived: a row can drop on any but an archived one. */
  listItems: UserMenuItem[];
  isSubitem: boolean;
  /** Its list is already on screen; read at mount, when it tells a shown row from one the list opened with. */
  isArriving: boolean;
  prepareHide?: () => boolean;
}

export function MenuSheetDraggableItem({ item, siblings, listItems, isSubitem, isArriving, prepareHide }: MenuSheetDraggableItemProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);

  // Mounted into a list already on screen: it arrived by a show, so it travels in and unfolds its submenu as it lands
  const [hasArrived] = useState(isArriving);
  const [isSubmenuHiddenVisible, setSubmenuHiddenVisible] = useSubmenuGroupOpen(item.id, 'hidden');
  const [isSubmenuArchivedVisible, setSubmenuArchivedVisible] = useSubmenuGroupOpen(item.id, 'archived');
  const [isFolding, setIsFolding] = useState(false);

  const hiddenSubitemCount = item.submenu?.filter((sub) => menuGroup(sub) === 'hidden').length ?? 0;
  const archivedSubitemCount = item.submenu?.filter((sub) => menuGroup(sub) === 'archived').length ?? 0;
  const hasSubmenu = isSubmenuShown(item);

  const moves = useMenuRowMoves({
    item,
    siblings,
    listItems,
    // The submenu folds away before the row moves to the hidden rows, as a closed Hidden list opens first
    prepareHide: () => {
      const opensHidden = prepareHide?.() ?? false;
      if (!hasSubmenu) return opensHidden;
      setIsFolding(true);
      return true;
    },
  });

  const prepareSubitemHide = () => {
    if (isSubmenuHiddenVisible) return false;
    setSubmenuHiddenVisible(true);
    return !!hiddenSubitemCount;
  };

  // The dragged row runs the drop, since its submenu folds and its list opens the Hidden list. An effect event, as whether
  // that list is open changes without the drag registering again.
  const handleDrop = useEffectEvent((target: Record<string | symbol, unknown> | undefined) => {
    followReorderFocus(item.id);
    if (target) moves.dropOn(target);
  });

  useEffect(() => {
    const element = dragRef.current;
    if (!element) return;
    const data = getDraggableItemData(item, item.membership.displayOrder, 'menuItem', item.entityType);
    return combine(
      draggable({
        element,
        dragHandle: element,
        canDrag: () => canMove(item, siblings),
        getInitialData: () => data,
        onDrop: ({ location }) => handleDrop(location.current.dropTargets[0]?.data),
        // A chip, as a board panel drags: the native preview would snapshot the whole row with its submenu
        onGenerateDragPreview: ({ nativeSetDragImage }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: pointerOutsideOfPreview({ x: '8px', y: '4px' }),
            render({ container }) {
              setPreviewContainer(container);
              return () => setPreviewContainer(null);
            },
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source: { data: dragged } }) =>
          !item.archived &&
          isMenuItemDragData(dragged) &&
          dragged.item.id !== item.id &&
          listItems.some((listItem) => listItem.id === dragged.item.id),
        getIsSticky: () => true,
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDrop: () => setClosestEdge(null),
        onDragLeave: () => setClosestEdge(null),
      }),
    );
  }, [item, siblings, listItems]);

  return (
    <li className={cn('relative', isSubitem ? 'group/row' : 'group/parent')} data-icon={!!getMenuSection(item.entityType)?.icon}>
      <div ref={dragRef}>
        <MenuSheetItemEdit item={item} siblings={siblings} isSubitem={isSubitem} isArriving={hasArrived} moves={moves} />
        <AnimatePresence initial={hasArrived}>
          {hasSubmenu && (
            <motion.div
              key="submenu"
              {...menuListMotion}
              animate={{ ...menuListMotion.animate, transition: { ...menuListMotion.transition, delay: hasArrived ? menuRowLandSeconds : 0 } }}
              // The fold is a CSS grid row: a motion height exit measures by collapsing the block for a frame, which makes a
              // sheet scrolled to its end jump up
              className={cn('grid transition-[grid-template-rows] duration-200 ease-in-out', isFolding ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}
            >
              <div className={cn('min-h-0 min-w-0 transition-opacity duration-200', isFolding && 'overflow-hidden opacity-0')}>
                <ul>
                  <MenuSheetItemsListEdit items={item.submenu ?? []} group="active" prepareHide={prepareSubitemHide} isSubmenu />
                </ul>
                <MenuSheetHiddenGroup
                  entityType={item.submenu[0].entityType}
                  isSubmenu
                  isOpen={isSubmenuHiddenVisible}
                  onToggle={() => setSubmenuHiddenVisible(!isSubmenuHiddenVisible)}
                  count={hiddenSubitemCount}
                  dropItems={item.submenu}
                  movesWithRow
                >
                  <MenuSheetItemsListEdit items={item.submenu ?? []} group="hidden" isSubmenu />
                </MenuSheetHiddenGroup>
                {!!archivedSubitemCount && (
                  <MenuSheetHiddenGroup
                    entityType={item.submenu[0].entityType}
                    variant="archived"
                    isSubmenu
                    isOpen={isSubmenuArchivedVisible}
                    onToggle={() => setSubmenuArchivedVisible(!isSubmenuArchivedVisible)}
                    count={archivedSubitemCount}
                    movesWithRow
                  >
                    <MenuSheetItemsListEdit items={item.submenu ?? []} group="archived" isSubmenu />
                  </MenuSheetHiddenGroup>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {closestEdge && <DropIndicator className="h-0.5" edge={closestEdge} />}
      {/* Windows fades a drag preview wider than 280px */}
      {previewContainer &&
        createPortal(
          <div className="max-w-64">
            <EntityChip type={item.entityType} id={item.id} name={item.name} url={item.thumbnailUrl} icon={getMenuSection(item.entityType)?.icon} />
          </div>,
          previewContainer,
        )}
    </li>
  );
}
