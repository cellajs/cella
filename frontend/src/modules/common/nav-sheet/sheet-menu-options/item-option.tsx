import type { ContextEntity } from 'backend/types/common';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UpdateMenuOptionsProp, updateMembership as baseUpdateMembership } from '~/api/memberships';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { UserMenuItem } from '~/types';

interface ItemOptionProps {
  item: UserMenuItem;
  itemType: ContextEntity;
  parentItemSlug?: string;
}

export const ItemOption = ({ item, itemType, parentItemSlug }: ItemOptionProps) => {
  const { t } = useTranslation();
  const [isItemArchived, setItemArchived] = useState(item.membership.archived);
  const [isItemMuted, setItemMuted] = useState(item.membership.muted);
  const archiveStateToggle = useNavigationStore((state) => state.archiveStateToggle);
  const callback = useMutateWorkSpaceQueryData(['workspaces', parentItemSlug ? parentItemSlug : item.slug]);
  const { mutate: updateMembership, status } = useMutation({
    mutationFn: (values: UpdateMenuOptionsProp) => {
      return baseUpdateMembership(values);
    },
    onSuccess: (updatedMembership) => {
      if (updatedMembership.archived !== isItemArchived) {
        const archived = updatedMembership.archived || !isItemArchived;
        archiveStateToggle(item.id, archived, parentItemSlug ? parentItemSlug : null);
        toast.success(
          archived
            ? t('common:success.archived_resource', { resource: t(`common:${itemType}`) })
            : t('common:success.restore_resource', { resource: t(`common:${itemType}`) }),
        );
        setItemArchived(archived);
      }
      if (updatedMembership.muted !== isItemMuted) {
        const muted = updatedMembership.muted || !isItemMuted;
        toast.success(
          muted
            ? t('common:success.mute_resource', { resource: t(`common:${itemType}`) })
            : t('common:success.unmute_resource', { resource: t(`common:${itemType}`) }),
        );
        setItemMuted(muted);
      }
      callback([updatedMembership], parentItemSlug ? 'updateProjectMembership' : 'updateWorkspaceMembership');
    },
  });

  const itemOptionStatesHandle = (state: 'archive' | 'mute') => {
    const role = item.membership.role;
    if (state === 'archive') updateMembership({ membershipId: item.membership.id, role, archived: !isItemArchived });
    if (state === 'mute') updateMembership({ membershipId: item.membership.id, role, muted: !isItemMuted });
  };

  return (
    <motion.div
      layoutId={`sheet-menu-item-${item.id}`}
      className={`group flex relative items-center ${parentItemSlug ? 'h-12 relative menu-item-sub' : 'h-14 '} w-full p-0 pr-2 justify-start rounded  focus:outline-none
        ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground
        ${!isItemArchived && 'ring-1 cursor-grab'} `}
    >
      {status === 'pending' ? (
        <Loader2 className="text-muted-foreground h-8 w-8 mx-3 my-2 animate-spin" />
      ) : (
        <AvatarWrap
          className={`${parentItemSlug ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} ${isItemArchived && 'opacity-70'}`}
          type={itemType}
          id={item.id}
          name={item.name}
          url={item.thumbnailUrl}
        />
      )}

      <div className="truncate grow py-2 pl-1 text-left">
        <div className={`truncate ${parentItemSlug ? 'text-sm' : 'text-base mb-1'} leading-5 ${isItemArchived && 'opacity-70'}`}>{item.name}</div>
        <div className="flex items-center gap-4 transition-opacity delay-500">
          <OptionButtons
            Icon={isItemArchived ? ArchiveRestore : Archive}
            title={isItemArchived ? t('common:restore') : t('common:archive')}
            onClick={() => itemOptionStatesHandle('archive')}
            subTask={!!parentItemSlug}
          />
          <OptionButtons
            Icon={isItemMuted ? Bell : BellOff}
            title={isItemMuted ? t('common:unmute') : t('common:mute')}
            onClick={() => itemOptionStatesHandle('mute')}
            subTask={!!parentItemSlug}
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
  subTask?: boolean;
}
const OptionButtons = ({ Icon, title, onClick, subTask = false }: OptionButtonsProps) => (
  <Button
    variant="link"
    size="sm"
    className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover:opacity-100"
    aria-label={`Click ${title}`}
    onClick={onClick}
  >
    <Icon size={subTask ? 12 : 14} className="mr-1" />
    {title}
  </Button>
);