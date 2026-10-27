import { ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon, GripVerticalIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';
import { Spinner } from '~/modules/common/spinner';
import { toastOffline } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { buildMembershipUpdate } from '~/modules/navigation/menu-sheet/helpers/build-membership-update';
import { menuItemOrder } from '~/modules/navigation/menu-sheet/helpers/menu-item-order';
import { menuListOpenMs } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const avatarBoxClass = tw(
  'relative z-2 mx-3 my-2 flex shrink-0 group-data-[subitem=true]/options-item:mx-4 group-data-[subitem=true]/options-item:my-1',
);

interface MembershipFlagButtonProps {
  icon: IconComponent;
  title: string;
  onClick: () => void;
}

function MembershipFlagButton({ icon: Icon, title, onClick }: MembershipFlagButtonProps) {
  return (
    <Button
      variant="none"
      size="sm"
      className="link-decoration active:link-decoration-strong focus-inset -mx-1 -my-0.5 h-5 rounded-sm px-1 text-foreground-soft text-xs leading-3 hover:text-foreground hover:underline"
      onClick={onClick}
    >
      <Icon className="size-3.25 group-data-[subitem=true]/options-item:size-3" />
      {title}
    </Button>
  );
}

interface MenuSheetItemEditProps {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted; the arrow keys on the handle step through it. */
  siblings: UserMenuItem[];
  /** It is a row of a submenu: a smaller row on the submenu's dotted line. */
  isSubitem: boolean;
  icon?: IconComponent;
  /** Its submenu shows below it, so the submenu's dotted line starts at its avatar. */
  hasSubmenuBelow?: boolean;
  /** It mounted by moving here from the other list, so it travels above the rows it passes. */
  isArriving?: boolean;
  /** Runs before it is archived; true when the move has to wait, for the archived list to open or its submenu to fold. */
  onArchive?: () => boolean;
}

export function MenuSheetItemEdit({
  item,
  siblings,
  isSubitem,
  icon: Icon,
  hasSubmenuBelow = false,
  isArriving = false,
  onArchive,
}: MenuSheetItemEditProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();
  const [isTravelling, setIsTravelling] = useState(isArriving);

  const toggleMembershipFlag = (key: 'archived' | 'muted') => {
    if (key === 'muted') return updateMembership(buildMembershipUpdate(item, { muted: !item.membership.muted }));
    if (item.membership.archived && !isOnline) return toastOffline();

    const update = buildMembershipUpdate(item, { archived: !item.membership.archived });
    // One step at a time: a closed archive opens and a submenu folds before the row travels
    if (!item.membership.archived && onArchive?.()) setTimeout(() => updateMembership(update), menuListOpenMs);
    else updateMembership(update);
  };

  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const isSortable = !item.membership.archived && siblings.length > 1;

  const move = (step: -1 | 1) => {
    const target = siblings[index + step];
    if (!target) return;
    const displayOrder = menuItemOrder(siblings, item, target, step < 0 ? 'top' : 'bottom');
    updateMembership(buildMembershipUpdate(item, { displayOrder }));
  };

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
      data-archived={item.membership.archived}
      // The ghost button's hover tint (8% foreground) mixed into the fill, opaque so the grip box can repaint it. The fill
      // is muted/70 on the card made opaque, so a row travelling past covers the rows under it.
      className={cn(
        'group/options-item relative flex h-12 w-full items-center pr-2 [--hover-fill:color-mix(in_oklab,var(--muted),var(--foreground)_8%)] before:absolute before:inset-0.5 before:rounded-sm before:bg-[color-mix(in_srgb,var(--muted)_70%,var(--card))] before:transition-colors hover:text-accent-foreground hover:before:bg-(--hover-fill) data-[subitem=true]:h-11',
        isSortable && 'cursor-grab',
        isTravelling && 'z-3',
      )}
    >
      {/* The view mode's dotted submenu line, drawn per row so it travels with the row and stays under its avatar while a move animates */}
      {(hasSubmenuBelow || (isSubitem && !item.membership.archived)) && (
        <span
          aria-hidden
          className={cn(
            'dotted-line pointer-events-none absolute bottom-0 left-[27px] text-foreground opacity-50',
            hasSubmenuBelow ? 'top-10' : 'top-0',
          )}
        />
      )}
      {status === 'pending' && isOnline && (
        <div className="absolute z-10">
          <Spinner className="m-1 mr-3 size-10 p-1 text-muted-foreground group-data-[subitem=true]/options-item:mx-3 group-data-[subitem=true]/options-item:my-2 group-data-[subitem=true]/options-item:size-7" />
        </div>
      )}
      {isSortable ? (
        // A pointer drags the whole row (draggable-item.tsx); the handle gives the keyboard and the move menu the same reorder
        <ReorderHandle
          id={item.id}
          name={item.name}
          index={index}
          total={siblings.length}
          onMove={move}
          className={cn(
            avatarBoxClass,
            // Opaque while the avatar fades for the grip, so the subitem line behind it stays hidden. Any focus shows the
            // outline, a click's too: the grip then takes the arrow keys. An outline keeps its offset clear over the row's fill.
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

      {/* Not a clipping box: focus scrolls one to reveal a button whose box reaches past it */}
      <div className="relative min-w-0 grow text-left">
        <div className="truncate text-md leading-5 group-data-[archived=true]/options-item:opacity-70">
          {item.name} {env.VITE_DEBUG_MODE && <span className="text-faint-foreground">#{item.membership.displayOrder}</span>}
        </div>
        <div className="flex items-center gap-2">
          <MembershipFlagButton
            icon={item.membership.archived ? ArchiveRestoreIcon : ArchiveIcon}
            title={item.membership.archived ? t('c:restore') : t('c:archive')}
            onClick={() => toggleMembershipFlag('archived')}
          />
          <MembershipFlagButton
            icon={item.membership.muted ? BellIcon : BellOffIcon}
            title={item.membership.muted ? t('c:unmute') : t('c:mute')}
            onClick={() => toggleMembershipFlag('muted')}
          />
        </div>
      </div>
    </motion.div>
  );
}
