import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ArchiveIcon, ChevronDownIcon, EyeOffIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isChannelHideable } from 'shared';
import { CountBadge } from '~/modules/common/count-badge';
import type { UserMenuItem } from '~/modules/me/types';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { hiddenDropData, isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuSheetHiddenToggleProps {
  onToggle: () => void;
  /** Which rows it folds: the hidden ones, or the archived ones, which nothing drops on. */
  variant?: 'hidden' | 'archived';
  count: number;
  /** The channels its unseen count adds up. */
  channelIds?: string[];
  /** The rows that may drop on it to cross, active and hidden; none outside edit mode. */
  dropItems?: UserMenuItem[];
}

const emptyChannelIds: string[] = [];

function MenuSheetHiddenToggle({ onToggle, variant = 'hidden', count, channelIds = emptyChannelIds, dropItems }: MenuSheetHiddenToggleProps) {
  const { t } = useTranslation();
  const unseenCount = useUnseenCount(channelIds);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropAction, setDropAction] = useState<'hide' | 'show' | null>(null);

  const isArchived = variant === 'archived';
  const Icon = isArchived ? ArchiveIcon : EyeOffIcon;

  useEffect(() => {
    const element = dropRef.current;
    if (!element || !dropItems || isArchived) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source: { data } }) =>
        isMenuItemDragData(data) && isChannelHideable(data.item.entityType) && dropItems.some((item) => item.id === data.item.id),
      getData: () => hiddenDropData,
      onDragEnter: ({ source: { data } }) => {
        if (isMenuItemDragData(data)) setDropAction(data.item.membership.hidden ? 'show' : 'hide');
      },
      onDragLeave: () => setDropAction(null),
      onDrop: () => setDropAction(null),
    });
  }, [dropItems, isArchived]);

  return (
    <div ref={dropRef} className="relative">
      <Button
        onClick={onToggle}
        disabled={count < 1 && !dropAction}
        variant="ghost"
        // Borderless, so the icon centers on the avatars and dots above it
        className={cn(
          'w-full gap-0 border-0 p-0 ring-offset-0 transition duration-300 ring-inset group-data-[submenu=true]/hidden:h-8',
          dropAction && 'bg-muted ring-primary ring-2',
        )}
      >
        <div className="flex w-12 items-center justify-center py-2">
          <Icon className="ml-2 opacity-75 group-data-[submenu=true]/hidden:size-3.5" />
        </div>
        {/* A flex row, so hiding the taller count leaves the label where it is */}
        <div className="text-muted-foreground flex min-w-0 grow items-center p-2 text-left">
          <span className="truncate text-sm group-data-[submenu=true]/hidden:text-xs">
            {dropAction ? t(`c:drop_to_${dropAction}`) : t(isArchived ? 'c:archived' : 'c:hidden')}
          </span>
          <span className="text-faint-foreground inline-block px-2 py-1 text-xs group-data-[hidden-visible=true]/hidden:hidden">
            {unseenCount > 0 ? <CountBadge count={unseenCount} className="inline-flex" /> : count}
          </span>
        </div>
        <div className="px-3">
          <ChevronDownIcon className="opacity-50 transition-transform group-data-[has-hidden=false]/hidden:hidden group-data-[hidden-visible=true]/hidden:rotate-180 group-data-[submenu=true]/hidden:size-3.5" />
        </div>
      </Button>
      {/* In a submenu it joins the last row above, down to 0.5625rem above the icon */}
      <SubmenuConnector className="-top-2 hidden h-4.25 group-data-[submenu=true]/hidden:flex" />
    </div>
  );
}

interface MenuSheetHiddenGroupProps extends MenuSheetHiddenToggleProps {
  isSubmenu?: boolean;
  isOpen: boolean;
  /** Travels with the moving row it sits under. */
  movesWithRow?: boolean;
  children: ReactNode;
}

/** The Hidden row with the hidden rows behind it, or the Archived row with the archived ones, for a section or a row's submenu. */
export function MenuSheetHiddenGroup({ isSubmenu = false, isOpen, movesWithRow = false, children, ...toggleProps }: MenuSheetHiddenGroupProps) {
  const { count } = toggleProps;

  return (
    <div className="group/hidden" data-has-hidden={!!count} data-submenu={isSubmenu} data-hidden-visible={isOpen}>
      {/* Not a row with a layoutId, so it gets its own layout animation to travel with the rows a hide or show
          shifts; only then, so other changes of place stay instant */}
      <motion.div layout="position" layoutDependency={movesWithRow ? undefined : count}>
        <MenuSheetHiddenToggle {...toggleProps} />
      </motion.div>
      <AnimatePresence initial={false}>
        {/* Empty, it has nothing to fold: kept open, a first hidden row moves in without waiting for it to unfold */}
        {(isOpen || !count) && (
          <motion.ul key="hidden" {...menuListMotion}>
            {children}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
