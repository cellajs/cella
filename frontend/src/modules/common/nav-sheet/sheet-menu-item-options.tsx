import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { Archive, ArchiveRestore, Bell, BellOff, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateMembership } from '~/api/memberships';
import { arrayMove, getDraggableItemData, getReorderDestinationIndex } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { DraggableItemData, Page } from '~/types';
import { DropIndicator } from '../drop-indicator';

interface SheetMenuItemProps {
  item: Page;
  sectionName: 'organizations' | 'projects' | 'workspaces';
  isGlobalDragging: boolean;
  setGlobalDragging: (dragging: boolean) => void;
}

type PageDraggableItemData = DraggableItemData<Page>;

const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.index === 'number';
};

export const SheetMenuItemOptions = ({ item, sectionName, isGlobalDragging, setGlobalDragging }: SheetMenuItemProps) => {
  const dragRef = useRef(null);
  const dragButtonRef = useRef<HTMLButtonElement>(null);
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isItemArchived, setItemArchived] = useState(item.archived);
  const [isItemMuted, setItemMuted] = useState(item.muted);

  const user = useUserStore((state) => state.user);
  const archiveStateToggle = useNavigationStore((state) => state.archiveStateToggle);
  const { activeItemsOrder, setActiveItemsOrder } = useNavigationStore();

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

  const onDragOver = () => {
    setClosestEdge(null);
  };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = dragRef.current;
    const dragButton = dragButtonRef.current;
    const data = getDraggableItemData(
      item,
      activeItemsOrder[sectionName].findIndex((el) => el === item.id),
      'menuItem',
    );

    if (!element || !dragButton) return;

    return combine(
      draggable({
        element,
        dragHandle: dragButton,
        getInitialData: () => data,
        onDragStart: () => {
          setDragging(true);
          setGlobalDragging(true);
        },
        onDrop: () => {
          setDragging(false);
          setGlobalDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        canDrop({ source }) {
          return isPageData(source.data);
        },
        getIsSticky: () => true,
        getData({ input }) {
          return attachClosestEdge(data, {
            element,
            input,
            allowedEdges: ['top', 'bottom'],
          });
        },
        onDrag: ({ self, source }) => {
          if (isPageData(source.data) && source.data.item.id === item.id) {
            setClosestEdge(null);
            return;
          }
          setClosestEdge(extractClosestEdge(self.data));
        },
        onDrop: () => onDragOver(),
        onDragLeave: () => onDragOver(),
      }),
    );
  }, [item, activeItemsOrder[sectionName]]);

  // monitoring drop event
  useEffect(() => {
    return monitorForElements({
      canMonitor({ source }) {
        return isPageData(source.data) && source.data.item.id === item.id;
      },
      onDrop({ location, source }) {
        const target = location.current.dropTargets[0];
        const sourceData = source.data;
        if (!target || !isPageData(sourceData) || !isPageData(target.data)) return;

        const closestEdgeOfTarget: Edge | null = extractClosestEdge(target.data);
        const destination = getReorderDestinationIndex(sourceData.index, closestEdgeOfTarget, target.data.index, 'vertical');

        const newItemOrder = arrayMove(activeItemsOrder[sectionName], sourceData.index, destination);
        setActiveItemsOrder(sectionName, newItemOrder);
      },
    });
  }, [item, activeItemsOrder[sectionName]]);

  return (
    <div className="relative my-1" ref={dragRef}>
      <div
        ref={dragRef}
        style={{ opacity: `${dragging ? 0.3 : 1}` }}
        className={`group flex relative items-center sm:max-w-[18rem] h-14 w-full cursor-pointer justify-start rounded p-0 focus:outline-none
      ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground 
      ${!isItemArchived && 'ring-1'} `}
      >
        <AvatarWrap className="m-2" type={item.type} id={item.id} name={item.name} url={item.thumbnailUrl} />
        <div className="truncate grow p-2 pl-2 text-left">
          <div className="truncate text-foreground/50 leading-5">{item.name}</div>
          <div className={`flex items-center gap-4 mt-1 ${isGlobalDragging ? 'h-4' : ''}`}>
            <Button
              variant="link"
              size="sm"
              className={`p-0 font-light text-xs h-4 leading-3 ${isGlobalDragging ? 'hidden' : ''}`}
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
            <Button
              variant="link"
              size="sm"
              className={`p-0 font-light text-xs h-4 leading-3 ${isGlobalDragging ? 'hidden' : ''}`}
              aria-label="Toggle Mute"
              onClick={itemMuteStateHandle}
            >
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
          <Button size="xs" variant="none" ref={dragButtonRef} className="p-2 mr-1 cursor-grab focus-visible:ring-inset focus-visible:ring-offset-0">
            <GripVertical size={16} className="opacity-50 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
          </Button>
        )}
      </div>
      {closestEdge && <DropIndicator className="h-[2px]" edge={closestEdge} gap="2px" />}
    </div>
  );
};

SheetMenuItemOptions.displayName = 'SheetMenuItemOptions';
