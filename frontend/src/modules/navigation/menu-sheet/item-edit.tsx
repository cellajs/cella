import { onlineManager } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Bell, BellOff } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { env } from '~/env';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import type { UpdateMembershipProp } from '~/modules/memberships/api';
import { useMemberUpdateMutation } from '~/modules/memberships/query/mutations';
import { Button } from '~/modules/ui/button';

interface MenuItemEditProps {
  item: UserMenuItem;
}

export const MenuItemEdit = ({ item }: MenuItemEditProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();

  const handleUpdateMembershipKey = (key: 'archive' | 'mute') => {
    if (key === 'archive' && item.membership.archived && !onlineManager.isOnline()) {
      return toaster(t('common:action.offline.text'), 'warning');
    }

    const updatedMembership: UpdateMembershipProp = {
      id: item.membership.id,
      idOrSlug: item.id,
      entityType: item.entity,
      orgIdOrSlug: item.membership.organizationId,
    };

    if (key === 'archive') updatedMembership.archived = !item.membership.archived;
    if (key === 'mute') updatedMembership.muted = !item.membership.muted;

    updateMembership(updatedMembership);
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/optionsItem flex relative items-center h-14 w-full p-0 pr-2 justify-start rounded focus:outline-hidden
        ring-inset ring-muted/25 focus-visible:ring-foreground hover:bg-accent/50 hover:text-accent-foreground ring-1 data-[archived=false]:cursor-grab
        group-data-[submenu=false]/menuOptions:h-12"
    >
      {status === 'pending' && onlineManager.isOnline() && (
        <div className="absolute z-10">
          <Spinner
            className="p-1 m-2 text-black opacity-50 h-10 w-10 group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:p-1 group-data-[submenu=false]/menuOptions:h-8 group-data-[submenu=false]/menuOptions:w-8"
          />
        </div>
      )}
      <AvatarWrap
        className="m-2 group-data-[subitem=true]/optionsItem:text-xs group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:h-8 group-data-[submenu=false]/menuOptions:w-8 group-data-[archived=true]/optionsItem:opacity-70"
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />

      <div className="truncate grow py-1 pl-1 text-left">
        <div className="truncate group-data-[subitem=true]/optionsItem:text-xs leading-6 group-data-[archived=true]/optionsItem:opacity-70">
          {item.name} {env.VITE_DEBUG_UI && <span className="text-muted">#{item.membership.order}</span>}
        </div>
        <div className="flex items-center gap-4 transition-opacity delay-500">
          <MenuItemEditButton
            Icon={item.membership.archived ? ArchiveRestore : Archive}
            title={item.membership.archived ? t('common:restore') : t('common:archive')}
            onClick={() => handleUpdateMembershipKey('archive')}
            subitem={!item.submenu}
          />
          <MenuItemEditButton
            Icon={item.membership.muted ? Bell : BellOff}
            title={item.membership.muted ? t('common:unmute') : t('common:mute')}
            onClick={() => handleUpdateMembershipKey('mute')}
            subitem={!item.submenu}
          />
        </div>
      </div>
    </motion.div>
  );
};

interface MenuItemEditButtonProps {
  Icon: React.ElementType;
  title: string;
  onClick: () => void;
  subitem?: boolean;
}
const MenuItemEditButton = ({ Icon, title, onClick, subitem = false }: MenuItemEditButtonProps) => (
  <Button
    variant="link"
    size="sm"
    className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover/optionsItem:opacity-100"
    aria-label={`Click ${title}`}
    onClick={onClick}
  >
    <Icon size={subitem ? 12 : 14} className="mr-1" />
    {title}
  </Button>
);
