import { onlineManager } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon, GripVerticalIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { type KeyboardEvent, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getRelativeOrder } from 'shared/utils/display-order';
import { env } from '~/env';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { buildMembershipUpdate } from '~/modules/navigation/menu-sheet/helpers/build-membership-update';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuItemEditProps {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted; the arrow keys on the handle step through it. */
  siblings: UserMenuItem[];
  icon?: IconComponent;
}

export function MenuItemEdit({ item, siblings, icon: Icon }: MenuItemEditProps) {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();

  const handleUpdateMembershipKey = (key: 'archived' | 'muted') => {
    if (key === 'archived' && item.membership.archived && !onlineManager.isOnline()) {
      return toaster.warning(t('c:action.offline.text'));
    }

    updateMembership(buildMembershipUpdate(item, key === 'archived' ? { archived: !item.membership.archived } : { muted: !item.membership.muted }));
  };

  const handleRef = useRef<HTMLButtonElement>(null);
  const refocusAtOrder = useRef<number | null>(null);

  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const isSortable = !item.membership.archived && siblings.length > 1;

  const move = (step: -1 | 1) => {
    const target = siblings[index + step];
    if (!target) return;
    const ordered = siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.membership.displayOrder }));
    const displayOrder = getRelativeOrder(ordered, target.membership.displayOrder, item.id, step < 0 ? 'top' : 'bottom');
    refocusAtOrder.current = displayOrder;
    updateMembership(buildMembershipUpdate(item, { displayOrder }));
  };

  // React re-inserts a row it moves down, and a removed node drops focus
  useEffect(() => {
    if (refocusAtOrder.current === null || refocusAtOrder.current !== item.membership.displayOrder) return;
    refocusAtOrder.current = null;
    handleRef.current?.focus();
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    move(event.key === 'ArrowUp' ? -1 : 1);
  };

  const avatar = (
    <EntityAvatar
      className="size-8 group-data-[submenu=false]/menu-options:size-6 group-data-[archived=true]/options-item:opacity-70"
      type={item.entityType}
      id={item.id}
      icon={Icon}
      name={item.name}
      url={item.thumbnailUrl}
    />
  );
  const avatarBox = 'm-2 mx-3 flex shrink-0 group-data-[submenu=false]/menu-options:mx-4 group-data-[submenu=false]/menu-options:my-1';

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/options-item relative flex h-12 w-full items-center justify-start rounded-sm p-0 pr-2 ring-1 ring-muted ring-inset hover:bg-accent/50 hover:text-accent-foreground data-[archived=false]:cursor-grab group-data-[submenu=false]/menu-options:h-10"
    >
      {status === 'pending' && onlineManager.isOnline() && (
        <div className="absolute z-10">
          <Spinner className="m-1 mr-3 size-10 p-1 text-muted-foreground group-data-[submenu=false]/menu-options:mx-3 group-data-[submenu=false]/menu-options:my-2 group-data-[submenu=false]/menu-options:size-7 group-data-[submenu=false]/menu-options:p-1" />
        </div>
      )}
      {isSortable ? (
        // A pointer drags the whole row (item-edit-wrapper.tsx); the handle gives the keyboard the same reorder
        <button
          ref={handleRef}
          type="button"
          aria-roledescription={t('c:sortable')}
          aria-label={t('c:sortable_position', { name: item.name, position: index + 1, total: siblings.length })}
          onKeyDown={handleKeyDown}
          className={cn('focus-effect group/drag relative cursor-grab rounded-md active:cursor-grabbing', avatarBox)}
        >
          <span className="inline-flex transition-[opacity,filter] group-hover/options-item:opacity-30 group-hover/options-item:blur-[1px] group-focus-visible/drag:opacity-30 group-focus-visible/drag:blur-[1px]">
            {avatar}
          </span>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/options-item:opacity-100 group-focus-visible/drag:opacity-100">
            <GripVerticalIcon className="size-4" />
          </span>
        </button>
      ) : (
        <span className={avatarBox}>{avatar}</span>
      )}

      {/* Not a clipping box: focus scrolls one to reveal a button whose box reaches past it */}
      <div className="min-w-0 grow text-left group-data-[submenu=false]/menu-options:pl-0">
        <div className="truncate text-md leading-5 group-data-[subitem=true]/options-item:text-xs group-data-[archived=true]/options-item:opacity-70">
          {item.name} {env.VITE_DEBUG_MODE && <span className="text-muted-foreground/50">#{item.membership.displayOrder}</span>}
        </div>
        <div className="flex items-center gap-2 transition-opacity delay-500">
          <MenuItemEditButton
            icon={item.membership.archived ? ArchiveRestoreIcon : ArchiveIcon}
            title={item.membership.archived ? t('c:restore') : t('c:archive')}
            onClick={() => handleUpdateMembershipKey('archived')}
            subitem={!item.submenu}
          />
          <MenuItemEditButton
            icon={item.membership.muted ? BellIcon : BellOffIcon}
            title={item.membership.muted ? t('c:unmute') : t('c:mute')}
            onClick={() => handleUpdateMembershipKey('muted')}
            subitem={!item.submenu}
          />
        </div>
      </div>
    </motion.div>
  );
}

interface MenuItemEditButtonProps {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  subitem?: boolean;
}
function MenuItemEditButton({ icon: Icon, title, onClick, subitem = false }: MenuItemEditButtonProps) {
  return (
    <Button
      variant="none"
      size="sm"
      className="link-decoration active:link-decoration-strong focus-inset -mx-1 -my-0.5 h-5 rounded-sm px-1 py-0 text-primary text-xs leading-3 opacity-80 hover:underline hover:opacity-100"
      aria-label={`Click ${title}`}
      onClick={onClick}
    >
      <Icon className={subitem ? 'size-3' : 'size-3.25'} />
      {title}
    </Button>
  );
}
