import { onlineManager } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon, GripVerticalIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { getRelativeOrder } from 'shared/utils/display-order';
import { env } from '~/env';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { ReorderHandle } from '~/modules/common/reorder-handle/reorder-handle';
import { Spinner } from '~/modules/common/spinner';
import { toastOffline } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { buildMembershipUpdate } from '~/modules/navigation/menu-sheet/helpers/build-membership-update';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

const avatarBoxClass = tw('mx-3 my-2 flex shrink-0 group-data-[subitem=true]/options-item:mx-4 group-data-[subitem=true]/options-item:my-1');

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
      className="link-decoration active:link-decoration-strong focus-inset -mx-1 -my-0.5 h-5 rounded-sm px-1 text-primary text-xs leading-3 opacity-80 hover:underline hover:opacity-100"
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
  icon?: IconComponent;
}

export function MenuSheetItemEdit({ item, siblings, icon: Icon }: MenuSheetItemEditProps) {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();

  const toggleMembershipFlag = (key: 'archived' | 'muted') => {
    if (key === 'archived' && item.membership.archived && !onlineManager.isOnline()) return toastOffline();

    updateMembership(buildMembershipUpdate(item, key === 'archived' ? { archived: !item.membership.archived } : { muted: !item.membership.muted }));
  };

  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const isSortable = !item.membership.archived && siblings.length > 1;

  const move = (step: -1 | 1) => {
    const target = siblings[index + step];
    if (!target) return;
    const ordered = siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.membership.displayOrder }));
    const displayOrder = getRelativeOrder(ordered, target.membership.displayOrder, item.id, step < 0 ? 'top' : 'bottom');
    updateMembership(buildMembershipUpdate(item, { displayOrder }));
  };

  const avatar = (
    <EntityAvatar
      className="size-8 group-data-[subitem=true]/options-item:size-6 group-data-[archived=true]/options-item:opacity-70"
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
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/options-item relative flex h-12 w-full items-center rounded-sm pr-2 ring-1 ring-muted ring-inset hover:bg-accent/50 hover:text-accent-foreground data-[subitem=true]:h-10 data-[archived=false]:cursor-grab"
    >
      {status === 'pending' && onlineManager.isOnline() && (
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
          className={cn(avatarBoxClass, 'focus-effect group/drag relative cursor-grab rounded-md active:cursor-grabbing')}
        >
          <span className="inline-flex transition-[opacity,filter] group-hover/options-item:opacity-30 group-hover/options-item:blur-[1px] group-focus-visible/drag:opacity-30 group-focus-visible/drag:blur-[1px]">
            {avatar}
          </span>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/options-item:opacity-100 group-focus-visible/drag:opacity-100">
            <GripVerticalIcon className="size-4" />
          </span>
        </ReorderHandle>
      ) : (
        <span className={avatarBoxClass}>{avatar}</span>
      )}

      {/* Not a clipping box: focus scrolls one to reveal a button whose box reaches past it */}
      <div className="min-w-0 grow text-left">
        <div className="truncate text-md leading-5 group-data-[subitem=true]/options-item:text-xs group-data-[archived=true]/options-item:opacity-70">
          {item.name} {env.VITE_DEBUG_MODE && <span className="text-muted-foreground/50">#{item.membership.displayOrder}</span>}
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
