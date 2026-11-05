import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ArchiveIcon, ChevronDownIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isChannelArchivable } from 'shared';
import { CountBadge } from '~/modules/common/count-badge';
import type { UserMenuItem } from '~/modules/me/types';
import { archivedDropData } from '~/modules/navigation/menu-sheet/helpers/is-archived-drop-data';
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuSheetArchivedToggleProps {
  onToggle: () => void;
  archivedCount: number;
  archivedChannelIds?: string[];
  /** The rows that may drop on it to cross, active and archived; none outside edit mode. */
  dropItems?: UserMenuItem[];
}

const emptyChannelIds: string[] = [];

function MenuSheetArchivedToggle({ onToggle, archivedCount, archivedChannelIds = emptyChannelIds, dropItems }: MenuSheetArchivedToggleProps) {
  const { t } = useTranslation();
  const archivedUnseenCount = useUnseenCount(archivedChannelIds);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropAction, setDropAction] = useState<'archive' | 'restore' | null>(null);

  useEffect(() => {
    const element = dropRef.current;
    if (!element || !dropItems) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source: { data } }) =>
        isMenuItemDragData(data) && isChannelArchivable(data.item.entityType) && dropItems.some((item) => item.id === data.item.id),
      getData: () => archivedDropData,
      onDragEnter: ({ source: { data } }) => {
        if (isMenuItemDragData(data)) setDropAction(data.item.membership.archived ? 'restore' : 'archive');
      },
      onDragLeave: () => setDropAction(null),
      onDrop: () => setDropAction(null),
    });
  }, [dropItems]);

  return (
    <div ref={dropRef} className="relative">
      <Button
        onClick={onToggle}
        disabled={archivedCount < 1 && !dropAction}
        variant="ghost"
        // Borderless, so the icon centers on the avatars and dots above it
        className={cn(
          'w-full gap-0 border-0 p-0 ring-offset-0 transition duration-300 ring-inset group-data-[submenu=true]/archived:h-8',
          dropAction && 'bg-muted ring-primary ring-2',
        )}
      >
        <div className="flex w-12 items-center justify-center py-2">
          <ArchiveIcon className="ml-2 size-5 opacity-75 group-data-[submenu=true]/archived:size-3.5" />
        </div>
        {/* A flex row, so hiding the taller count leaves the label where it is */}
        <div className="text-muted-foreground flex min-w-0 grow items-center p-2 text-left">
          <span className="truncate text-sm group-data-[submenu=true]/archived:text-xs">
            {dropAction ? t(`c:drop_to_${dropAction}`) : t('c:archived')}
          </span>
          <span className="text-faint-foreground inline-block px-2 py-1 text-xs group-data-[archived-visible=true]/archived:hidden">
            {archivedUnseenCount > 0 ? <CountBadge count={archivedUnseenCount} className="inline-flex" /> : archivedCount}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon className="opacity-50 transition-transform group-data-[archived-visible=true]/archived:rotate-180 group-data-[has-archived=false]/archived:hidden group-data-[submenu=true]/archived:size-3.5" />
        </div>
      </Button>
      {/* In a submenu it joins the last row above, down to 0.5625rem above the icon */}
      <SubmenuConnector className="-top-2 hidden h-4.25 group-data-[submenu=true]/archived:flex" />
    </div>
  );
}

interface MenuSheetArchivedGroupProps extends MenuSheetArchivedToggleProps {
  isSubmenu?: boolean;
  isOpen: boolean;
  /** Travels with the moving row it sits under. */
  movesWithRow?: boolean;
  children: ReactNode;
}

/** The Archived row with the archived rows behind it, for a section or a row's submenu. */
export function MenuSheetArchivedGroup({ isSubmenu = false, isOpen, movesWithRow = false, children, ...toggleProps }: MenuSheetArchivedGroupProps) {
  const { archivedCount } = toggleProps;

  return (
    <div className="group/archived" data-has-archived={!!archivedCount} data-submenu={isSubmenu} data-archived-visible={isOpen}>
      {/* Not a row with a layoutId, so it gets its own layout animation to travel with the rows an archive or restore
          shifts; only then, so other changes of place stay instant */}
      <motion.div layout="position" layoutDependency={movesWithRow ? undefined : archivedCount}>
        <MenuSheetArchivedToggle {...toggleProps} />
      </motion.div>
      <AnimatePresence initial={false}>
        {/* Empty, it has nothing to fold: kept open, a first archived row moves in without waiting for it to unfold */}
        {(isOpen || !archivedCount) && (
          <motion.ul key="archived" {...menuListMotion}>
            {children}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
