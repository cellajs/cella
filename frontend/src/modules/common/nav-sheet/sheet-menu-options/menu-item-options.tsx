import { onlineManager } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UpdateMenuOptionsProp, updateMembership as baseUpdateMembership } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { showToast } from '~/lib/toasts';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import type { UserMenuItem } from '~/types/common';
import { env } from '../../../../../env';
import Spinner from '../../spinner';
import { updateMenuItem } from '../helpers/update-menu-item';

interface MenuItemOptionsProps {
  item: UserMenuItem;
}

export const MenuItemOptions = ({ item }: MenuItemOptionsProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMutation({
    mutationFn: (values: UpdateMenuOptionsProp) => baseUpdateMembership(values),
    onSuccess: (updatedMembership) => {
      let toastMessage: string | undefined;

      const updatedEntity: UserMenuItem = { ...item, membership: { ...item.membership, ...updatedMembership } };

      if (updatedMembership.archived !== item.membership.archived) {
        toastMessage = t(`common:success.${updatedMembership.archived ? 'archived' : 'restore'}_resource`, { resource: t(`common:${item.entity}`) });
      }

      if (updatedMembership.muted !== item.membership.muted) {
        toastMessage = t(`common:success.${updatedMembership.muted ? 'mute' : 'unmute'}_resource`, { resource: t(`common:${item.entity}`) });
      }
      updateMenuItem(updatedEntity);
      dispatchCustomEvent('menuEntityChange', { entity: item.entity, membership: updatedMembership });

      if (toastMessage) showToast(toastMessage, 'success');
    },
  });

  const handleUpdateMembershipKey = (key: 'archive' | 'mute') => {
    if (!onlineManager.isOnline()) {
      toast.warning(t('common:action.offline.text'));
      return;
    }

    const { role, id: membershipId, organizationId, archived, muted } = item.membership;
    const membership = { membershipId, role, muted, archived, organizationId };

    if (key === 'archive') membership.archived = !item.membership.archived;
    if (key === 'mute') membership.muted = !item.membership.muted;
    updateMembership(membership);
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-archived={item.membership.archived}
      className="group/optionsItem flex relative items-center h-14 w-full p-0 pr-2 justify-start rounded focus:outline-none
        ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground ring-1 cursor-grab
        group-data-[submenu=false]/menuOptions:h-12
        group-data-[submenu=false]/menuOptions:menu-item-sub"
    >
      {status === 'pending' && (
        <div className="absolute z-10">
          <Spinner
            className="p-1 m-2 opacity-50 h-10 w-10 group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:p-1 group-data-[submenu=false]/menuOptions:h-8 group-data-[submenu=false]/menuOptions:w-8"
            inline
          />
        </div>
      )}
      <AvatarWrap
        className="m-2 group-data-[submenu=false]/menuOptions:text-xs group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:h-8 group-data-[submenu=false]/menuOptions:w-8 group-data-[archived=true]/optionsItem:opacity-70"
        type={item.entity}
        id={item.id}
        name={item.name}
        url={item.thumbnailUrl}
      />

      <div className="truncate grow py-2 pl-1 text-left">
        <div className="truncate text-sm leading-5 group-data-[archived=true]/optionsItem:opacity-70">
          {item.name} {env.VITE_DEBUG_UI && <span className="text-muted">#{item.membership.order}</span>}
        </div>
        <div className="flex items-center gap-4 transition-opacity delay-500">
          <OptionButtons
            Icon={item.membership.archived ? ArchiveRestore : Archive}
            title={item.membership.archived ? t('common:restore') : t('common:archive')}
            onClick={() => handleUpdateMembershipKey('archive')}
            subtask={!item.submenu}
          />
          <OptionButtons
            Icon={item.membership.muted ? Bell : BellOff}
            title={item.membership.muted ? t('common:unmute') : t('common:mute')}
            onClick={() => handleUpdateMembershipKey('mute')}
            subtask={!item.submenu}
          />
        </div>
      </div>
    </motion.div>
  );
};

interface OptionButtonsProps {
  Icon: React.ElementType;
  title: string;
  onClick: () => void;
  subtask?: boolean;
}
const OptionButtons = ({ Icon, title, onClick, subtask = false }: OptionButtonsProps) => (
  <Button
    variant="link"
    size="sm"
    className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover/optionsItem:opacity-100"
    aria-label={`Click ${title}`}
    onClick={onClick}
  >
    <Icon size={subtask ? 12 : 14} className="mr-1" />
    {title}
  </Button>
);
