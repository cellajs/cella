import { useSortable } from '@dnd-kit/sortable';
import { Archive, BellOff, GripVertical, ArchiveRestore, Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateMembership } from '~/api/memberships';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { Page } from '~/types';
import { CSS } from '@dnd-kit/utilities';

interface SheetMenuItemProps {
  item: Page;
}

export const SheetMenuItemOptions = ({ item }: SheetMenuItemProps) => {
  const { t } = useTranslation();
  const [isItemArchived, setItemArchived] = useState(item.archived);
  const [isItemMuted, setItemMuted] = useState(item.muted);
  const user = useUserStore((state) => state.user);
  const archiveStateToggle = useNavigationStore((state) => state.archiveStateToggle);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = {
    transition,
    transform: CSS.Transform.toString(transform),
  };

  const itemArchiveStateHandle = () => {
    const itemArchiveStatus = !isItemArchived;

    updateMembership(item.id, user.id, item.role ? item.role : undefined, itemArchiveStatus, isItemMuted)
      .then(() => {
        archiveStateToggle(item.id, itemArchiveStatus);
        toast.success(itemArchiveStatus ? t('common:success.archived_organization') : t('common:success.restore_organization'));
        setItemArchived(itemArchiveStatus);
      })
      .catch(() => {
        toast.error(t('common:error.error'));
      });
  };

  const itemMuteStateHandle = () => {
    const itemMuteStatus = !isItemMuted;

    updateMembership(item.id, user.id, item.role ? item.role : undefined, isItemArchived, itemMuteStatus)
      .then(() => {
        toast.success(itemMuteStatus ? t('common:success.mute_organization') : t('common:success.unmute_organization'));
        setItemMuted(itemMuteStatus);
      })
      .catch(() => {
        toast.error(t('common:error.error'));
      });
  };

  return (
    <div
      style={style}
      className={`group mb-1 flex sm:max-w-[18rem] h-14 w-full cursor-pointer items-start justify-start rounded p-0 focus:outline-none
      ${!isItemArchived ? 'ring-1' : ''} ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground`}
    >
      <AvatarWrap className="m-2" type={item.type} id={item.id} name={item.name} url={item.thumbnailUrl} />
      <div className="truncate grow p-2 pl-2 text-left">
        <div className="truncate text-foreground/50 leading-5">{item.name}</div>
        <div className="flex items-center gap-4 mt-1">
          <Button
            variant="link"
            size="sm"
            className="p-0 font-light text-xs h-4 leading-3"
            aria-label="Toggle archive"
            onClick={itemArchiveStateHandle}
          >
            {isItemArchived ? (
              <>
                <ArchiveRestore size={14} className="mr-1" /> {t('common:restore')}
              </>
            ) : (
              <>
                <Archive size={14} className="mr-1" />
                {t('common:archive')}
              </>
            )}
          </Button>

          <Button variant="link" size="sm" className="p-0 font-light text-xs h-4 leading-3" aria-label="Toggle Mute" onClick={itemMuteStateHandle}>
            {isItemMuted ? (
              <>
                <Bell size={14} className="mr-1" />
                {t('common:unmute')}
              </>
            ) : (
              <>
                <BellOff size={14} className="mr-1" />
                {t('common:mute')}
              </>
            )}
          </Button>
        </div>
      </div>
      {!isItemArchived && (
        <div ref={setNodeRef} {...listeners} {...attributes} className="p-2 cursor-grab">
          <GripVertical size={16} className="mt-3 mr-1 opacity-50 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
        </div>
      )}
    </div>
  );
};

SheetMenuItemOptions.displayName = 'SheetMenuItemOptions';
