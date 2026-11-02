import { ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon, GripVerticalIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isChannelArchivable } from 'shared';
import { env } from '~/env';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';
import { Spinner } from '~/modules/common/spinner';
import { TooltipButton } from '~/modules/common/tooltip-button';
import type { UserMenuItem } from '~/modules/me/types';
import { canMove } from '~/modules/navigation/menu-sheet/helpers/can-move';
import { canMute } from '~/modules/navigation/menu-sheet/helpers/can-mute';
import type { MenuRowMoves } from '~/modules/navigation/menu-sheet/helpers/use-menu-row-moves';
import { SubmenuConnector } from '~/modules/navigation/menu-sheet/submenu-connector';
import { Button } from '~/modules/ui/button';
import { DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const avatarBoxClass = tw(
  'relative z-2 mx-3 my-2 flex shrink-0 group-data-[subitem=true]/options-item:mx-4 group-data-[subitem=true]/options-item:my-1',
);

interface MenuSheetItemEditProps {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted; the arrow keys on the handle step through it. */
  siblings: UserMenuItem[];
  /** It is a row of a submenu: a smaller row, joined to the row above by two dots. */
  isSubitem: boolean;
  icon?: IconComponent;
  /** It mounted by moving here from the other list, so it travels above the rows it passes. */
  isArriving?: boolean;
  moves: MenuRowMoves;
}

export function MenuSheetItemEdit({ item, siblings, isSubitem, icon: Icon, isArriving = false, moves }: MenuSheetItemEditProps) {
  const { t } = useTranslation();
  const [isTravelling, setIsTravelling] = useState(isArriving);

  const { archived, muted } = item.membership;
  const isArchivable = isChannelArchivable(item.entityType);
  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const isMovable = canMove(item, siblings);

  const avatar = (
    <EntityAvatar
      // An icon avatar's tile would stand out on the row's fill
      className={cn(
        'size-8 group-data-[subitem=true]/options-item:size-6 group-data-[archived=true]/options-item:opacity-70',
        Icon && 'bg-transparent shadow-none',
      )}
      type={item.entityType}
      id={item.id}
      icon={Icon}
      name={item.name}
      url={item.thumbnailUrl}
    />
  );

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      onLayoutAnimationComplete={() => setIsTravelling(false)}
      data-subitem={isSubitem}
      data-archived={archived}
      // The ghost button's hover tint (8% foreground) mixed into the fill, opaque so the grip box can repaint it. The fill
      // is muted/70 on the card made opaque, so a row travelling past covers the rows under it.
      className={cn(
        'group/options-item relative flex h-12 w-full items-center pr-2 [--hover-fill:color-mix(in_oklab,var(--muted),var(--foreground)_8%)] before:absolute before:inset-0.5 before:rounded-sm before:bg-[color-mix(in_srgb,var(--muted)_70%,var(--card))] before:transition-colors hover:text-accent-foreground hover:before:bg-(--hover-fill) data-[subitem=true]:h-11',
        isMovable && 'cursor-grab',
        isTravelling && 'z-3',
      )}
    >
      {/* Drawn per row, so the dots travel with it while a move animates. The gap ends at this avatar 0.625rem down and
          starts 0.5rem up below the parent's avatar, 0.625rem up below another sub-row's. */}
      {isSubitem && !archived && <SubmenuConnector className={index === 0 ? '-top-2 h-4.5' : '-top-2.5 h-5'} />}
      {moves.isSaving && (
        <div className="absolute z-10">
          <Spinner className="m-1 mr-3 size-10 p-1 text-muted-foreground group-data-[subitem=true]/options-item:mx-3 group-data-[subitem=true]/options-item:my-2 group-data-[subitem=true]/options-item:size-7" />
        </div>
      )}
      {isMovable ? (
        // A pointer drags the whole row (draggable-item.tsx); the handle gives the keyboard and the move menu the same moves
        <ReorderHandle
          id={item.id}
          name={item.name}
          index={index}
          total={siblings.length}
          onMove={moves.move}
          onMovePastEnd={isArchivable ? moves.moveAcross : undefined}
          menuItems={
            isArchivable && (
              <DropdownMenuItem onClick={moves.crossArchive}>
                {archived ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
                {archived ? t('c:restore') : t('c:archive')}
              </DropdownMenuItem>
            )
          }
          description={isArchivable ? t(archived ? 'c:sortable_archived_menu_row.text' : 'c:sortable_menu_row.text') : undefined}
          className={cn(
            avatarBoxClass,
            // Any focus shows the outline, a click's too: the grip then takes the arrow keys. An outline keeps its offset
            // clear over the row's fill.
            'group/drag relative cursor-grab rounded-md outline-hidden focus-ring:focus:outline-2 focus-ring:focus:outline-ring focus-ring:focus:outline-solid focus-ring:focus:outline-offset-2 focus:bg-(--hover-fill) active:cursor-grabbing group-hover/options-item:bg-(--hover-fill)',
          )}
        >
          <span className="inline-flex transition-[opacity,filter] group-hover/options-item:opacity-30 group-hover/options-item:blur-[1px] group-focus/drag:opacity-30 group-focus/drag:blur-[1px]">
            {avatar}
          </span>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/options-item:opacity-100 group-focus/drag:opacity-100">
            <GripVerticalIcon className="size-4" />
          </span>
        </ReorderHandle>
      ) : (
        <span className={avatarBoxClass}>{avatar}</span>
      )}

      <div className="relative min-w-0 grow truncate text-left text-md leading-5 group-data-[archived=true]/options-item:opacity-70">
        {item.name} {env.VITE_DEBUG_MODE && <span className="text-faint-foreground">#{item.membership.displayOrder}</span>}
      </div>
      {canMute(item) && (
        <TooltipButton toolTipContent={muted ? t('c:unmute') : t('c:mute')} side="top">
          <Button
            variant={muted ? 'outline' : 'ghost'}
            size="icon"
            className={cn('relative size-8 shrink-0 group-data-[subitem=true]/options-item:size-7', !muted && 'text-faint-foreground')}
            onClick={moves.toggleMuted}
          >
            {muted ? <BellOffIcon className="size-4" /> : <BellIcon className="size-4" />}
          </Button>
        </TooltipButton>
      )}
    </motion.div>
  );
}
