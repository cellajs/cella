import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UpdateMenuOptionsProp, updateMembership as baseUpdateMembership } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import type { UserMenuItem } from '~/types/common';
import Spinner from '../../spinner';

interface MenuItemOptionsProps {
  item: UserMenuItem;
}

export const MenuItemOptions = ({ item }: MenuItemOptionsProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMutation({
    mutationFn: (values: UpdateMenuOptionsProp) => baseUpdateMembership(values),
    onSuccess: (updatedMembership) => {
      let toastMessage: string | undefined;

      if (updatedMembership.archived !== item.membership.archived) {
        const archived = updatedMembership.archived || !item.membership.archived;

        item.membership.archived = archived;
        toastMessage = t(`common:success.${updatedMembership.archived ? 'archived' : 'restore'}_resource`, { resource: t(`common:${item.entity}`) });
      }

      if (updatedMembership.muted !== item.membership.muted) {
        const muted = updatedMembership.muted || !item.membership.muted;
        item.membership.muted = muted;
        toastMessage = t(`common:success.${updatedMembership.muted ? 'mute' : 'unmute'}_resource`, { resource: t(`common:${item.entity}`) });
      }

      dispatchCustomEvent('menuEntityChange', { entity: item.entity, membership: updatedMembership, toast: toastMessage });
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
      className={`group flex relative items-center ${!item.submenu ? 'h-12 relative menu-item-sub' : 'h-14 '} w-full p-0 pr-2 justify-start rounded focus:outline-none
        ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground ring-1 cursor-grab`}
    >
      {status === 'pending' ? (
        <div className={`${!item.submenu ? 'my-2 mx-3 h-8 w-8' : 'm-2'} p-2 ${item.membership.archived && 'opacity-70'}`}>
          <Spinner inline />
        </div>
      ) : (
        <AvatarWrap
          className={`${!item.submenu ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} ${item.membership.archived && 'opacity-70'}`}
          type={item.entity}
          id={item.id}
          name={item.name}
          url={item.thumbnailUrl}
        />
      )}

      <div className="truncate grow py-2 pl-1 text-left">
        <div className={`truncate ${item.entity ? 'text-sm' : 'text-base mb-1'} leading-5 ${item.membership.archived && 'opacity-70'}`}>
          {item.name} {config.debug && <span className="text-muted">#{item.membership.order}</span>}
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
    className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover:opacity-100"
    aria-label={`Click ${title}`}
    onClick={onClick}
  >
    <Icon size={subtask ? 12 : 14} className="mr-1" />
    {title}
  </Button>
);
