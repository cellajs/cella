import { onlineManager } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Bell, BellOff, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { env } from '~/env';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import type { MutationUpdateMembership } from '~/modules/memberships/types';
import { Button } from '~/modules/ui/button';

interface MenuItemEditProps {
  item: UserMenuItem;
  icon?: LucideIcon;
}

export const MenuItemEdit = ({ item, icon: Icon }: MenuItemEditProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMemberUpdateMutation();

  const handleUpdateMembershipKey = (key: 'archived' | 'muted') => {
    if (key === 'archived' && item.membership.archived && !onlineManager.isOnline()) {
      return toaster(t('common:action.offline.text'), 'warning');
    }

    const updatedMembership: MutationUpdateMembership = {
      id: item.membership.id,
      orgIdOrSlug: item.membership.organizationId,
      // Mutation variables
      idOrSlug: item.id,
      entityType: item.entityType,
    };

    if (key === 'archived') updatedMembership.archived = !item.membership.archived;
    if (key === 'muted') updatedMembership.muted = !item.membership.muted;

    updateMembership(updatedMembership);
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/optionsItem flex relative items-center h-12 w-full p-0 pr-2 justify-start rounded focus:outline-hidden
        ring-inset ring-muted/25 focus-visible:ring-foreground hover:bg-accent/50 hover:text-accent-foreground ring-1 data-[archived=false]:cursor-grab
        group-data-[submenu=false]/menuOptions:h-12"
    >
      {status === 'pending' && onlineManager.isOnline() && (
        <div className="absolute z-10">
          <Spinner
            className="p-1 m-1 mr-3 text-black opacity-50 h-10 w-10 group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:p-1 group-data-[submenu=false]/menuOptions:h-7 group-data-[submenu=false]/menuOptions:w-7"
          />
        </div>
      )}
      <AvatarWrap
        className="m-2 mx-3 group-data-[subitem=true]/optionsItem:text-xs group-data-[submenu=false]/menuOptions:my-1 group-data-[submenu=false]/menuOptions:mx-4
            h-8 w-8 group-data-[submenu=false]/menuOptions:h-6 group-data-[submenu=false]/menuOptions:w-6 group-data-[archived=true]/optionsItem:opacity-70"
        type={item.entityType}
        id={item.id}
        icon={Icon}
        name={item.name}
        url={item.thumbnailUrl}
      />

      <div className="truncate grow text-left group-data-[submenu=false]/menuOptions:pl-0">
        <div className="truncate group-data-[subitem=true]/optionsItem:text-xs leading-5 text-md group-data-[archived=true]/optionsItem:opacity-70">
          {item.name} {env.VITE_DEBUG_UI && <span className="text-muted">#{item.membership.order}</span>}
        </div>
        <div className="flex items-center gap-4 transition-opacity delay-500">
          <MenuItemEditButton
            icon={item.membership.archived ? ArchiveRestore : Archive}
            title={item.membership.archived ? t('common:restore') : t('common:archive')}
            onClick={() => handleUpdateMembershipKey('archived')}
            subitem={!item.submenu}
          />
          <MenuItemEditButton
            icon={item.membership.muted ? Bell : BellOff}
            title={item.membership.muted ? t('common:unmute') : t('common:mute')}
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
const MenuItemEditButton = ({ icon: Icon, title, onClick, subitem = false }: MenuItemEditButtonProps) => (
  <Button
    variant="link"
    size="sm"
    className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover/optionsItem:opacity-100 hover:underline underline-offset-1"
    aria-label={`Click ${title}`}
    onClick={onClick}
  >
    <Icon size={subitem ? 12 : 13} strokeWidth={1.5} className="mr-2" />
    {title}
  </Button>
);
