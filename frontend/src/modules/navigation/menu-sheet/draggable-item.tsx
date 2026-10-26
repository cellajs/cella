import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { pointerOutsideOfPreview } from '@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview';
import { setCustomNativeDragPreview } from '@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DropIndicator } from '~/modules/common/drop-indicator';
import { EntityChip } from '~/modules/common/entity-chip';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetArchivedToggle } from '~/modules/navigation/menu-sheet/archived-toggle';
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';
import { menuListMotion, menuRowLandSeconds } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { MenuSheetItemEdit } from '~/modules/navigation/menu-sheet/item-edit';
import { MenuSheetItemsListEdit } from '~/modules/navigation/menu-sheet/items-list-edit';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { cn } from '~/utils/cn';
import { getDraggableItemData } from '~/utils/get-draggable-item-data';

interface MenuSheetDraggableItemProps {
  item: UserMenuItem;
  siblings: UserMenuItem[];
  isArchived: boolean;
  detailedMenu: boolean;
  /** Its list is already on screen; read at mount, when it tells a restored row from one the list opened with. */
  isArriving: boolean;
  options?: MenuSectionOptions;
  isSubmenuArchivedVisible?: boolean;
  onSubmenuArchivedChange: (id: string, open: boolean) => void;
  onArchive?: () => boolean;
}

export function MenuSheetDraggableItem({
  item,
  siblings,
  isArchived,
  options,
  isSubmenuArchivedVisible = false,
  detailedMenu,
  isArriving,
  onSubmenuArchivedChange,
  onArchive,
}: MenuSheetDraggableItemProps) {
  const dragRef = useRef<HTMLDivElement>(null);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [previewContainer, setPreviewContainer] = useState<HTMLElement | null>(null);

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
        canDrag: () => !item.membership.archived && siblings.length > 1,
        getInitialData: () => data,
        onDrop: () => followReorderFocus(item.id),
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
        canDrop: ({ source }) => canDropItem(source.data),
        getIsSticky: () => true,
        getData: ({ input }) => attachClosestEdge(data, { element, input, allowedEdges: ['top', 'bottom'] }),
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDrop: () => setClosestEdge(null),
        onDragLeave: () => setClosestEdge(null),
      }),
    );
  }, [item, siblings]);

  // Mounted into a list already on screen: it arrived by a restore, so it travels in and unfolds its submenu as it lands
  const [hasArrived] = useState(isArriving);
  const [isFolding, setIsFolding] = useState(false);

  const archivedSubitemCount = item.submenu?.filter((sub) => sub.membership.archived).length ?? 0;
  const hasSubmenu = !item.membership.archived && !!item.submenu?.length && detailedMenu;
  // Empty, it has nothing to fold: kept open, a first archived subitem moves in without waiting for it to unfold
  const showsArchivedSubitems = isSubmenuArchivedVisible || !archivedSubitemCount;

  // The submenu folds away before the row moves to the archive, as a closed archive opens first
  const handleArchive = () => {
    const opensArchive = onArchive?.() ?? false;
    if (!hasSubmenu) return opensArchive;
    setIsFolding(true);
    return true;
  };

  const handleSubitemArchive = () => {
    if (isSubmenuArchivedVisible) return false;
    onSubmenuArchivedChange(item.id, true);
    return !showsArchivedSubitems;
  };

  return (
    <li className="relative">
      <div ref={dragRef}>
        <MenuSheetItemEdit
          item={item}
          siblings={siblings}
          icon={options?.icon}
          hasSubmenuBelow={hasSubmenu}
          isArriving={hasArrived}
          onArchive={handleArchive}
        />
        <AnimatePresence initial={hasArrived}>
          {hasSubmenu && (
            <motion.div
              key="submenu"
              {...menuListMotion}
              animate={{ ...menuListMotion.animate, transition: { ...menuListMotion.transition, delay: hasArrived ? menuRowLandSeconds : 0 } }}
              data-has-archived={!!archivedSubitemCount}
              data-submenu={true}
              data-archived-visible={isSubmenuArchivedVisible}
              // The fold is a CSS grid row: a motion height exit measures by collapsing the block for a frame, which makes a
              // sheet scrolled to its end jump up
              className={cn(
                'group/archived grid transition-[grid-template-rows] duration-200 ease-in-out',
                isFolding ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]',
              )}
            >
              <div className={cn('min-h-0 min-w-0 transition-opacity duration-200', isFolding && 'overflow-hidden opacity-0')}>
                <ul>
                  <MenuSheetItemsListEdit items={item.submenu ?? []} isArchived={isArchived} onArchive={handleSubitemArchive} />
                </ul>
                {/* Not a row with a layoutId, so it gets its own layout animation to travel with the rows when a move reorders them */}
                <motion.div layout="position">
                  <MenuSheetArchivedToggle
                    onToggle={() => onSubmenuArchivedChange(item.id, !isSubmenuArchivedVisible)}
                    archivedCount={archivedSubitemCount}
                  />
                </motion.div>
                <AnimatePresence initial={false}>
                  {showsArchivedSubitems && (
                    <motion.ul key="archived" {...menuListMotion}>
                      <MenuSheetItemsListEdit items={item.submenu ?? []} isArchived={true} />
                    </motion.ul>
                  )}
                </AnimatePresence>
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
            <EntityChip type={item.entityType} id={item.id} name={item.name} url={item.thumbnailUrl} icon={options?.icon} />
          </div>,
          previewContainer,
        )}
    </li>
  );
}
