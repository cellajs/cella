import { onlineManager } from '@tanstack/react-query';
import { ArchiveIcon, ArchiveRestoreIcon, BellIcon, BellOffIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
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
  icon?: IconComponent;
}

export const MenuItemEdit = ({ item, icon: Icon }: MenuItemEditProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();

  const handleUpdateMembershipKey = (key: 'archived' | 'muted') => {
    if (key === 'archived' && item.membership.archived && !onlineManager.isOnline()) {
      return toaster(t('c:action.offline.text'), 'warning');
    }

    const updatedMembership: MutationUpdateMembership = {
      path: {
        id: item.membership.id,
        tenantId: item.tenantId,
        organizationId: item.membership.organizationId,
      },
      channelId: item.id,
      channelType: item.entityType,
    };

    if (key === 'archived') updatedMembership.body = { archived: !item.membership.archived };
    if (key === 'muted') updatedMembership.body = { muted: !item.membership.muted };

    updateMembership(updatedMembership);
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/optionsItem relative flex h-12 w-full items-center justify-start rounded-sm p-0 pr-2 ring-1 ring-muted/25 ring-inset hover:bg-accent/50 hover:text-accent-foreground focus:outline-hidden focus-visible:ring-foreground data-[archived=false]:cursor-grab group-data-[submenu=false]/menuOptions:h-10"
    >
      {status === 'pending' && onlineManager.isOnline() && (
        <div className="absolute z-10">
          <Spinner className="m-1 mr-3 h-10 w-10 p-1 text-black opacity-50 group-data-[submenu=false]/menuOptions:mx-3 group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:h-7 group-data-[submenu=false]/menuOptions:w-7 group-data-[submenu=false]/menuOptions:p-1" />
        </div>
      )}
      <EntityAvatar
        className="m-2 mx-3 h-8 w-8 text-sm group-data-[submenu=false]/menuOptions:mx-4 group-data-[submenu=false]/menuOptions:my-1 group-data-[submenu=false]/menuOptions:h-6 group-data-[submenu=false]/menuOptions:w-6 group-data-[subitem=true]/optionsItem:text-xs group-data-[archived=true]/optionsItem:opacity-70"
        type={item.entityType}
        id={item.id}
        icon={Icon}
        name={item.name}
        url={item.thumbnailUrl}
      />

      <div className="grow truncate text-left group-data-[submenu=false]/menuOptions:pl-0">
        <div className="truncate text-md leading-5 group-data-[subitem=true]/optionsItem:text-xs group-data-[archived=true]/optionsItem:opacity-70">
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
        </div>
      </div>
    </motion.div>
  );
};

interface MenuItemEditButtonProps {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  subitem?: boolean;
}
function MenuItemEditButton({ icon: Icon, title, onClick, subitem = false }: MenuItemEditButtonProps) {
  return (
    <Button
      variant="link"
      size="sm"
      className="h-4 px-0 py-0 text-xs leading-3 underline-offset-1 opacity-60 hover:underline hover:opacity-100 focus-visible:bg-accent/50 focus-visible:ring-0 focus-visible:ring-offset-0"
      aria-label={`Click ${title}`}
      onClick={onClick}
    >
      <Icon className={cn('mr-1.5', subitem ? 'icon-xs' : 'size-[0.8125rem]')} />
      {title}
    </Button>
  );
}
