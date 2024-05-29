import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff, GripVertical } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { updateMembership as baseUpdateMembership, type UpdateMenuOptionsProp } from '~/api/memberships';
import { arrayMove, getDraggableItemData, getReorderDestinationIndex, sortById } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { DraggableItemData, UserMenu } from '~/types';
import { DropIndicator } from '../drop-indicator';
import type { PageResourceType } from 'backend/types/common';
import type { MenuItem } from './sheet-menu-section';
import { MenuArchiveToggle } from './menu-archive-toggle';
import { useMutation } from '~/hooks/use-mutations';

interface MenuItemProps {
  sectionType: 'organizations' | 'workspaces';
  isGlobalDragging?: boolean;
  setGlobalDragging?: (dragging: boolean) => void;
  submenu?: boolean;
}

type PageDraggableItemData = DraggableItemData<MenuItem>;

const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.index === 'number';
};

export const SheetMenuItemsOptions = ({
  data,
  shownOption,
  sectionType,
  isGlobalDragging,
  submenu,
  setGlobalDragging,
}: MenuItemProps & { data: UserMenu[keyof UserMenu]; shownOption: 'archived' | 'unarchive' }) => {
  const { t } = useTranslation();
  const [isSubmenuArchivedVisible, setSubmenuArchivedVisible] = useState(false);
  const { activeItemsOrder, hideSubmenu, submenuItemsOrder } = useNavigationStore();
  if (data.items.length === 0) {
    return (
      <li className="py-2 text-muted-foreground text-sm text-light text-center">
        {t('common:no_resource_yet', { resource: t(sectionType.toLowerCase()).toLowerCase() })}
      </li>
    );
  }
  const items = data.items
    .filter((i) => (shownOption === 'archived' ? i.archived : !i.archived))
    .sort((a, b) => sortById(a.id, b.id, submenu && a.workspaceId ? submenuItemsOrder[a.workspaceId] : activeItemsOrder[sectionType]));

  return items.map((item) => (
    <div key={item.id}>
      <ItemOptions
        item={item}
        itemType={data.type}
        submenu={submenu}
        sectionType={sectionType}
        isGlobalDragging={isGlobalDragging}
        setGlobalDragging={setGlobalDragging}
      />
      {!item.archived && item.submenu && !!item.submenu.items.length && !hideSubmenu && (
        <>
          <SheetMenuItemsOptions
            data={item.submenu}
            shownOption={shownOption}
            sectionType="workspaces"
            submenu
            isGlobalDragging={isGlobalDragging}
            setGlobalDragging={setGlobalDragging}
          />
          <MenuArchiveToggle
            archiveToggleClick={() => setSubmenuArchivedVisible(!isSubmenuArchivedVisible)}
            inactiveCount={item.submenu.items.filter((i) => i.archived).length}
            isArchivedVisible={isSubmenuArchivedVisible}
            isSubmenu
          />
          {isSubmenuArchivedVisible && <SheetMenuItemsOptions data={item.submenu} shownOption="archived" sectionType="workspaces" submenu />}
        </>
      )}
    </div>
  ));
};

const ItemOptions = ({
  item,
  itemType,
  sectionType,
  isGlobalDragging,
  submenu,
  setGlobalDragging,
}: MenuItemProps & { item: MenuItem; itemType: PageResourceType }) => {
  const { t } = useTranslation();
  const dragRef = useRef(null);
  const dragButtonRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isItemArchived, setItemArchived] = useState(item.archived);
  const [isItemMuted, setItemMuted] = useState(item.muted);
  const archiveStateToggle = useNavigationStore((state) => state.archiveStateToggle);
  const { activeItemsOrder, setActiveItemsOrder, submenuItemsOrder, setSubmenuItemsOrder } = useNavigationStore();

  const { mutate: updateMembership } = useMutation({
    mutationFn: (values: UpdateMenuOptionsProp) => {
      return baseUpdateMembership(values);
    },
    onSuccess: (data) => {
      if (data.inactive !== isItemArchived) {
        const archived = data.inactive || !isItemArchived;
        archiveStateToggle(item.id, archived, item.workspaceId);
        toast.success(
          data.inactive
            ? t('common:success.archived_resource', { resource: t(`common:${submenu ? 'project' : sectionType.slice(0, -1)}`) })
            : t('common:success.restore_resource', { resource: t(`common:${submenu ? 'project' : sectionType.slice(0, -1)}`) }),
        );
        setItemArchived(archived);
      }
      if (data.muted !== isItemMuted) {
        const muted = data.muted || !isItemMuted;
        toast.success(
          muted
            ? t('common:success.mute_resource', { resource: t(`common:${submenu ? 'project' : sectionType.slice(0, -1)}`) })
            : t('common:success.unmute_resource', { resource: t(`common:${submenu ? 'project' : sectionType.slice(0, -1)}`) }),
        );
        setItemMuted(muted);
      }
    },
    onError: () => {
      toast.error(t('common:error.error'));
    },
  });

  const itemOptionStatesHandle = (state: 'archive' | 'mute') => {
    const archive = state === 'archive' ? !isItemArchived : isItemArchived;
    const muted = state === 'mute' ? !isItemMuted : isItemMuted;
    const role = item.role ? item.role : undefined;
    updateMembership({ membershipId: item.membershipId, role, archive, muted });
  };

  const onDragOver = () => {
    setClosestEdge(null);
  };

  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const submenuItemIndex = item.workspaceId ? submenuItemsOrder[item.workspaceId].findIndex((el) => el === item.id) : 0;
    const itemIndex = activeItemsOrder[sectionType].findIndex((el) => el === item.id);
    const element = dragRef.current;
    const dragButton = dragButtonRef.current;
    const data = getDraggableItemData(item, submenu ? submenuItemIndex : itemIndex, 'menuItem', itemType);

    if (!element || !dragButton) return;

    return combine(
      draggable({
        element,
        dragHandle: dragButton,
        getInitialData: () => data,
        onDragStart: () => {
          setDragging(true);
          if (setGlobalDragging) setGlobalDragging(true);
        },
        onDrop: () => {
          setDragging(false);
          if (setGlobalDragging) setGlobalDragging(false);
        },
      }),
      dropTargetForElements({
        element,
        // allow drop if both have sum menu or both have not
        canDrop({ source }) {
          return isPageData(source.data) && source.data.item.id !== item.id && source.data.itemType === itemType;
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
  }, [item, activeItemsOrder[sectionType]]);

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

        if (submenu && item.workspaceId) {
          const newItemOrder = arrayMove(submenuItemsOrder[item.workspaceId], sourceData.index, destination);
          setSubmenuItemsOrder(item.workspaceId, newItemOrder);
        } else {
          const newItemOrder = arrayMove(activeItemsOrder[sectionType], sourceData.index, destination);
          setActiveItemsOrder(sectionType, newItemOrder);
        }
      },
    });
  }, [item, activeItemsOrder[sectionType]]);

  return (
    <div key={item.id} className="relative my-1" ref={dragRef}>
      <motion.div
        layoutId={`sheet-menu-item-${item.id}`}
        ref={dragRef}
        style={{ opacity: `${dragging ? 0.3 : 1}` }}
        className={`group flex relative items-center sm:max-w-[18rem] ${submenu ? 'pl-2 h-12 w-11/12' : 'h-14 w-full'} p-0  cursor-pointer justify-start rounded  focus:outline-none
      ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground 
      ${!isItemArchived && 'ring-1'} `}
      >
        <AvatarWrap
          className={`${submenu ? 'm-1 h-8 w-8' : 'm-2'}`}
          type={sectionType.slice(0, -1).toUpperCase() as PageResourceType}
          id={item.id}
          name={item.name}
          url={item.thumbnailUrl}
        />
        <div className={`truncate grow ${submenu ? 'p-0' : 'p-2'} pl-2 text-left`}>
          <div className={`truncate text-foreground/80 ${submenu ? 'text-sm' : 'text-base'} leading-5`}>{item.name}</div>
          <div className={`flex items-center gap-4 mt-1 transition-opacity ${isGlobalDragging ? 'opacity-40 delay-0' : 'delay-500'}`}>
            <Button
              variant="link"
              size="sm"
              className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover:opacity-100"
              aria-label="Toggle archive"
              onClick={() => itemOptionStatesHandle('archive')}
            >
              {isItemArchived ? (
                <>
                  <ArchiveRestore size={submenu ? 12 : 14} className="mr-1" /> {t('common:restore')}
                </>
              ) : (
                <>
                  <Archive size={submenu ? 12 : 14} className="mr-1" />
                  {t('common:archive')}
                </>
              )}
            </Button>
            <Button
              variant="link"
              size="sm"
              className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover:opacity-100"
              aria-label="Toggle mute"
              onClick={() => itemOptionStatesHandle('mute')}
            >
              {isItemMuted ? (
                <>
                  <Bell size={submenu ? 12 : 14} className="mr-1" />
                  {t('common:unmute')}
                </>
              ) : (
                <>
                  <BellOff size={submenu ? 12 : 14} className="mr-1" />
                  {t('common:mute')}
                </>
              )}
            </Button>
          </div>
        </div>

        {!isItemArchived && (
          <Button size="xs" variant="none" ref={dragButtonRef} className="p-2 mr-1 cursor-grab focus-visible:ring-inset focus-visible:ring-offset-0">
            <GripVertical size={submenu ? 14 : 16} className="opacity-50 transition-opacity duration-300 ease-in-out group-hover:opacity-100" />
          </Button>
        )}
      </motion.div>
      {closestEdge && <DropIndicator className={`h-[2px]  ${submenu ? 'w-11/12' : 'w-full'}`} edge={closestEdge} gap="2px" />}
    </div>
  );
};
