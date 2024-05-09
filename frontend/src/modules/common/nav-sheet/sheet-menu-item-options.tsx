import { Archive, BellOff, GripVertical, ArchiveRestore, Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateMembership } from '~/api/memberships';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { Page } from '~/types';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { attachClosestEdge, type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { DropIndicator } from '@atlaskit/pragmatic-drag-and-drop-react-drop-indicator/box';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';

interface SheetMenuItemProps {
  item: Page;
  sectionName: 'organizations' | 'projects' | 'workspaces';
}

const itemKey = Symbol('item');

type ItemData = {
  [itemKey]: true;
  item: Page;
  index: number;
};

const arrayMove = (array: string[], startIndex: number, endIndex: number) => {
  const newArray = [...array];
  const [removedElement] = newArray.splice(startIndex, 1);
  newArray.splice(endIndex, 0, removedElement);
  return newArray;
};

const getItemData = (item: Page, items: string[]): ItemData => {
  return { [itemKey]: true, item: item, index: items.findIndex((el) => el === item.id) };
};

function isItemData(data: Record<string | symbol, unknown>): data is ItemData {
  return data[itemKey] === true;
}

export const SheetMenuItemOptions = ({ item, sectionName }: SheetMenuItemProps) => {
  const dragRef = useRef(null);
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
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

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = dragRef.current;
    const data = getItemData(item, activeItemsOrder[sectionName]);
    if (!element) return;

    return combine(
      draggable({
        element,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop({ source }) {
          return isItemData(source.data) && source.data.item.id !== item.id && source.data.item.type === item.type;
        },
        getData({ input }) {
          return attachClosestEdge(data, {
            element,
            input,
            allowedEdges: ['top', 'bottom'],
          });
        },
        onDrag({ self, source }) {
          if (source.element === element) {
            setClosestEdge(null);
            return;
          }
          const closestEdge = extractClosestEdge(self.data);
          setClosestEdge(closestEdge);
        },
        onDragLeave() {
          setClosestEdge(null);
          setIsDraggedOver(false);
        },
        onDrop() {
          setClosestEdge(null);
          setIsDraggedOver(false);
        },
        onDragEnter: () => setIsDraggedOver(true),
      }),
      autoScrollForElements({
        element,
        getConfiguration: () => ({
          maxScrollSpeed: 'standard',
        }),
        getAllowedAxis: () => 'vertical',
      }),
    );
  }, [item, activeItemsOrder[sectionName]]);

  // monitoring drop event
  useEffect(() => {
    return monitorForElements({
      canMonitor({ source }) {
        return isItemData(source.data) && source.data.item.id === item.id;
      },
      onDrop({ location, source }) {
        const target = location.current.dropTargets[0];
        const sourceData = source.data;
        if (!target || !isItemData(sourceData) || !isItemData(target.data)) return;

        const targetData = target.data;
        const indexOfTarget = activeItemsOrder[sectionName].findIndex((item) => item === targetData.item.id);
        if (indexOfTarget < 0) return;

        const newItemOrder = arrayMove(activeItemsOrder[sectionName], sourceData.index, indexOfTarget);
        setActiveItemsOrder(sectionName, newItemOrder);
      },
    });
  }, [item, activeItemsOrder[sectionName]]);

  return (
    <div
      ref={dragRef}
      style={{ opacity: `${dragging ? 0.3 : 1}` }}
      className={`group mb-0.5 flex relative sm:max-w-[18rem] h-14 w-full cursor-pointer items-start justify-start rounded p-0 focus:outline-none
      ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground 
      ${!isItemArchived ? 'ring-1' : ''} ${isDraggedOver ? 'bg-accent/80' : ''} `}
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
      {closestEdge && <DropIndicator edge={closestEdge} gap="2px" />}
      {!isItemArchived && (
        <div className="p-2 cursor-grab">
          <GripVertical size={16} className="mt-3 mr-1 opacity-50 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
        </div>
      )}
    </div>
  );
};

SheetMenuItemOptions.displayName = 'SheetMenuItemOptions';
