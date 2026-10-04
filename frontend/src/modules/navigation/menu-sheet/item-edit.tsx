import { onlineManager } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, ArrowDownIcon, ArrowUpIcon, BellIcon, BellOffIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { getRelativeOrder } from 'shared/utils/display-order';
import { env } from '~/env';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { IconComponent } from '~/modules/common/icons/types';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { MutationUpdateMembership } from '~/modules/memberships/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface MenuItemEditProps {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted; the move buttons step through it. */
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

    const updatedMembership: MutationUpdateMembership = {
      path: { id: item.membership.id, tenantId: item.tenantId, organizationId: item.membership.organizationId },
      body: key === 'archived' ? { archived: !item.membership.archived } : { muted: !item.membership.muted },
      channelId: item.id,
      channelType: item.entityType,
    };

    updateMembership(updatedMembership);
  };

  // The drag reorder one step at a time, for the keyboard and for a pointer that cannot drag
  const index = siblings.findIndex((sibling) => sibling.id === item.id);
  const move = (step: -1 | 1) => {
    const target = siblings[index + step];
    if (!target) return;
    const ordered = siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.membership.displayOrder }));
    updateMembership({
      path: { id: item.membership.id, tenantId: item.tenantId, organizationId: item.membership.organizationId || item.id },
      body: { displayOrder: getRelativeOrder(ordered, target.membership.displayOrder, item.id, step < 0 ? 'top' : 'bottom') },
      channelId: item.id,
      channelType: item.entityType,
    });
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/options-item relative flex h-12 w-full items-center justify-start rounded-sm p-0 pr-2 ring-1 ring-muted ring-inset hover:bg-accent/50 hover:text-accent-foreground focus:outline-hidden focus-visible:ring-foreground data-[archived=false]:cursor-grab group-data-[submenu=false]/menu-options:h-10"
    >
      {status === 'pending' && onlineManager.isOnline() && (
        <div className="absolute z-10">
          <Spinner className="m-1 mr-3 size-10 p-1 text-muted-foreground group-data-[submenu=false]/menu-options:mx-3 group-data-[submenu=false]/menu-options:my-2 group-data-[submenu=false]/menu-options:size-7 group-data-[submenu=false]/menu-options:p-1" />
        </div>
      )}
      <EntityAvatar
        className="m-2 mx-3 size-8 text-sm group-data-[submenu=false]/menu-options:mx-4 group-data-[submenu=false]/menu-options:my-1 group-data-[submenu=false]/menu-options:size-6 group-data-[subitem=true]/options-item:text-xs group-data-[archived=true]/options-item:opacity-70"
        type={item.entityType}
        id={item.id}
        icon={Icon}
        name={item.name}
        url={item.thumbnailUrl}
      />

      <div className="grow truncate text-left group-data-[submenu=false]/menu-options:pl-0">
        <div className="truncate text-md leading-5 group-data-[subitem=true]/options-item:text-xs group-data-[archived=true]/options-item:opacity-70">
          {item.name} {env.VITE_DEBUG_MODE && <span className="text-muted">#{item.membership.displayOrder}</span>}
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
          {!item.membership.archived && siblings.length > 1 && (
            <>
              <MenuItemEditButton
                icon={ArrowUpIcon}
                title={t('c:move_up')}
                label={`${t('c:move_up')}: ${item.name}`}
                onClick={() => move(-1)}
                disabled={index <= 0}
                iconOnly
                subitem={!item.submenu}
              />
              <MenuItemEditButton
                icon={ArrowDownIcon}
                title={t('c:move_down')}
                label={`${t('c:move_down')}: ${item.name}`}
                onClick={() => move(1)}
                disabled={index === siblings.length - 1}
                iconOnly
                subitem={!item.submenu}
              />
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface MenuItemEditButtonProps {
  icon: React.ElementType;
  title: string;
  /** Accessible name when it says more than the title. */
  label?: string;
  onClick: () => void;
  subitem?: boolean;
  /** Shows the icon alone, in a box wide enough to hit; the title stays the tooltip and the name. */
  iconOnly?: boolean;
  /** Stays focusable, so a move that reaches the end of the list does not drop keyboard focus. */
  disabled?: boolean;
}
function MenuItemEditButton({ icon: Icon, title, label, onClick, subitem = false, iconOnly = false, disabled = false }: MenuItemEditButtonProps) {
  return (
    <Button
      variant="link"
      size="sm"
      className={cn(
        'h-4 px-0 py-0 text-xs leading-3 underline-offset-1 opacity-80 hover:underline hover:opacity-100 focus-visible:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0',
        iconOnly && 'h-6 w-6 justify-center aria-disabled:cursor-default aria-disabled:opacity-30',
      )}
      aria-label={label ?? `Click ${title}`}
      aria-disabled={disabled || undefined}
      title={iconOnly ? title : undefined}
      onClick={() => !disabled && onClick()}
    >
      <Icon className={subitem ? 'size-3' : 'size-3.25'} />
      {!iconOnly && title}
    </Button>
  );
}
