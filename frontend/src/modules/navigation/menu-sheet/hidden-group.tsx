import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ArchiveIcon, ChevronDownIcon, EyeOffIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isChannelHideable } from 'shared';
import { CountBadge } from '~/modules/common/count-badge';
import type { UserMenuItem } from '~/modules/me/types';
import { menuListMotion } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { foldedToggleLabel, hiddenDropData, isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuSheetHiddenToggleProps {
  onToggle: () => void;
  /** Which rows it folds: the hidden ones, or the archived ones, which nothing drops on. */
  variant?: 'hidden' | 'archived';
  count: number;
  isOpen: boolean;
  /** The channels its unseen count adds up; none while the menu is edited. */
  channelIds?: string[];
  /** The rows that may drop on it to cross, active and hidden; none outside edit mode. */
  dropItems?: UserMenuItem[];
}

const emptyChannelIds: string[] = [];

function MenuSheetHiddenToggle({ onToggle, variant, count, channelIds = emptyChannelIds, dropItems, isOpen }: MenuSheetHiddenToggleProps) {
  const { t } = useTranslation();
  const unseenCount = useUnseenCount(channelIds);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropAction, setDropAction] = useState<'hide' | 'show' | null>(null);

  const isArchived = variant === 'archived';
  const Icon = isArchived ? ArchiveIcon : EyeOffIcon;
  const label = dropAction ? t(`c:drop_to_${dropAction}`) : t(isArchived ? 'c:archived' : 'c:hidden');
  const showsBadge = unseenCount > 0 && !isOpen;

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
        aria-expanded={isOpen}
        aria-label={isOpen || dropAction ? undefined : foldedToggleLabel(t, label, count, unseenCount)}
        // Borderless: the icon centers on the avatars and dots above it. Open, it keeps its resting look.
        className={cn(
          'group/hidden-toggle aria-expanded:hover:bg-hover w-full gap-0 border-0 p-0 ring-offset-0 transition duration-300 ring-inset group-data-[submenu=true]/hidden:h-8 aria-expanded:bg-transparent',
          dropAction && 'bg-muted aria-expanded:bg-muted ring-primary ring-2',
        )}
      >
        <div className="flex w-12 items-center justify-center py-2">
          <Icon className="ml-2 opacity-75 group-data-[submenu=true]/hidden:size-3.5" />
        </div>
        <div className="text-muted-foreground flex min-w-0 grow items-center gap-2 p-2 text-left">
          <span className="truncate text-sm group-data-[submenu=true]/hidden:text-xs">{label}</span>
          {count > 0 && <span className="text-faint-foreground text-xs group-data-[hidden-visible=true]/hidden:hidden">{count}</span>}
        </div>
        {showsBadge && <CountBadge count={unseenCount} variant="muted" className="shrink-0" />}
        {/* A badge takes the chevron's place; on hover the chevron widens in from the right as the section's buttons do, moving the badge aside */}
        <div
          className={cn(
            'grid justify-end pr-3 transition-[grid-template-columns] duration-200 ease-out motion-reduce:transition-none',
            showsBadge
              ? 'grid-cols-[0fr] group-hover/hidden-toggle:grid-cols-[1fr] group-focus-visible/hidden-toggle:grid-cols-[1fr]'
              : 'grid-cols-[1fr]',
          )}
        >
          <div className="flex min-w-0 justify-end overflow-hidden">
            <ChevronDownIcon
              className={cn(
                'ml-3 shrink-0 opacity-50 transition duration-200 group-data-[has-hidden=false]/hidden:hidden group-data-[hidden-visible=true]/hidden:rotate-180 group-data-[submenu=true]/hidden:size-3.5 motion-reduce:transition-none',
                showsBadge && 'opacity-0 group-hover/hidden-toggle:opacity-50 group-focus-visible/hidden-toggle:opacity-50',
              )}
            />
          </div>
        </div>
      </Button>
      {/* In a submenu it joins the last row above, down to 0.5625rem above the icon */}
      <SubmenuConnector className="-top-2 hidden h-4.25 group-data-[submenu=true]/hidden:flex" />
    </div>
  );
}

interface MenuSheetHiddenGroupProps extends MenuSheetHiddenToggleProps {
  isSubmenu?: boolean;
  /** Travels with the moving row it sits under. */
  movesWithRow?: boolean;
  children: ReactNode;
}

/** The Hidden row with the hidden rows behind it, or the Archived row with the archived ones, for a section or a row's submenu. */
export function MenuSheetHiddenGroup({ isSubmenu = false, movesWithRow, children, ...toggleProps }: MenuSheetHiddenGroupProps) {
  const { count, isOpen } = toggleProps;

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
