import { onlineManager } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UpdateMembershipProp, updateMembership as baseUpdateMembership } from '~/api/memberships';
import { useMutation } from '~/hooks/use-mutations';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { showToast } from '~/lib/toasts';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { updateMenuItem } from '~/modules/common/nav-sheet/helpers/menu-operations';
import Spinner from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';
import type { UserMenuItem } from '~/types/common';
import { env } from '../../../../../env';

interface MenuItemOptionsProps {
  item: UserMenuItem;
}

export const MenuItemOptions = ({ item }: MenuItemOptionsProps) => {
  const { t } = useTranslation();

  const { mutate: updateMembership, status } = useMutation({
    mutationFn: (values: UpdateMembershipProp) => baseUpdateMembership(values),
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

    const membership = { ...item.membership }; // Clone the membership to make it mutable

    if (key === 'archive') membership.archived = !item.membership.archived;
    if (key === 'mute') membership.muted = !item.membership.muted;

    updateMembership({
      ...membership,
      idOrSlug: item.id,
      entityType: item.entity,
      orgIdOrSlug: membership.organizationId,
    });
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      data-subitem={!item.submenu}
      data-archived={item.membership.archived}
      className="group/optionsItem flex relative items-center h-14 w-full p-0 pr-2 justify-start rounded focus:outline-none
        ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground ring-1 data-[archived=false]:cursor-grab
        group-data-[submenu=false]/menuOptions:h-12"
    >
      {status === 'pending' && (
        <div className="absolute z-10">
          <Spinner
            className="p-1 m-2 text-black opacity-50 h-10 w-10 group-data-[submenu=false]/menuOptions:my-2 group-data-[submenu=false]/menuOptions:mx-3
            group-data-[submenu=false]/menuOptions:p-1 group-data-[submenu=false]/menuOptions:h-8 group-data-[submenu=false]/menuOptions:w-8"
            inline
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
          <OptionButtons
            Icon={item.membership.archived ? ArchiveRestore : Archive}
            title={item.membership.archived ? t('common:restore') : t('common:archive')}
            onClick={() => handleUpdateMembershipKey('archive')}
            subitem={!item.submenu}
          />
          <OptionButtons
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

interface OptionButtonsProps {
  Icon: React.ElementType;
  title: string;
  onClick: () => void;
  subitem?: boolean;
}
const OptionButtons = ({ Icon, title, onClick, subitem = false }: OptionButtonsProps) => (
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
