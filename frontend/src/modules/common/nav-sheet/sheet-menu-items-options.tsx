import { type Edge, attachClosestEdge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { draggable, dropTargetForElements, monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { ContextEntity } from 'backend/types/common';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, Bell, BellOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type UpdateMenuOptionsProp, updateMembership as baseUpdateMembership } from '~/api/memberships';
import { useMutateWorkSpaceQueryData } from '~/hooks/use-mutate-query-data';
import { useMutation } from '~/hooks/use-mutations';
import { getDraggableItemData } from '~/lib/utils';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { Button } from '~/modules/ui/button';
import { useNavigationStore } from '~/store/navigation';
import type { DraggableItemData, UserMenuItem } from '~/types';
import { DropIndicator } from '../drop-indicator';
import { MenuArchiveToggle } from './menu-archive-toggle';

type PageDraggableItemData = DraggableItemData<UserMenuItem>;

const isPageData = (data: Record<string | symbol, unknown>): data is PageDraggableItemData => {
  return data.dragItem === true && typeof data.order === 'number' && data.type === 'menuItem';
};

export const SheetMenuItemsOptions = ({ data, shownOption }: { data: UserMenuItem[]; shownOption: 'archived' | 'unarchive' }) => {
  const { t } = useTranslation();
  const [submenuVisibility, setSubmenuVisibility] = useState<Record<string, boolean>>({});
  const { hideSubmenu } = useNavigationStore();
  const entityType = data[0].entity;
  const parentItemSlug = data[0].parentSlug;

  if (data.length === 0) {
    return <li className="py-2 text-muted-foreground text-sm text-light text-center">{t('common:no_resource_yet', { resource: entityType })}</li>;
  }

  const filteredItems = data
    .filter((i) => (shownOption === 'archived' ? i.membership.archived : !i.membership.archived))
    .sort((a, b) => a.membership.order - b.membership.order);

  const toggleSubmenuVisibility = (itemId: string) => {
    setSubmenuVisibility((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  return filteredItems.map((item) => {
    const isSubmenuArchivedVisible = submenuVisibility[item.id] || false;

    return (
      <div key={item.id}>
        <ItemOptions
          data={[...data].sort((a, b) => b.membership.order - a.membership.order)}
          item={item}
          itemType={entityType}
          parentItemSlug={parentItemSlug}
        />
        {!item.membership.archived && item.submenu && !!item.submenu.length && !hideSubmenu && (
          <>
            <SheetMenuItemsOptions data={item.submenu} shownOption={shownOption} />
            <MenuArchiveToggle
              archiveToggleClick={() => toggleSubmenuVisibility(item.id)}
              inactiveCount={item.submenu.filter((i) => i.membership.archived).length}
              isArchivedVisible={isSubmenuArchivedVisible}
              isSubmenu
            />
            {isSubmenuArchivedVisible && <SheetMenuItemsOptions data={item.submenu} shownOption="archived" />}
          </>
        )}
      </div>
    );
  });
};

const ItemOptions = ({
  data,
  item,
  itemType,
  parentItemSlug,
}: { data: UserMenuItem[]; parentItemSlug?: string; item: UserMenuItem; itemType: ContextEntity }) => {
  const { t } = useTranslation();
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isItemArchived, setItemArchived] = useState(item.membership.archived);
  const [isItemMuted, setItemMuted] = useState(item.membership.muted);
  const archiveStateToggle = useNavigationStore((state) => state.archiveStateToggle);
  const { menu } = useNavigationStore();
  const callback = useMutateWorkSpaceQueryData(['workspaces', parentItemSlug ? parentItemSlug : item.slug]);
  const { mutate: updateMembership } = useMutation({
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
    const archived = state === 'archive' ? !isItemArchived : isItemArchived;
    const muted = state === 'mute' ? !isItemMuted : isItemMuted;
    const role = item.membership.role;
    updateMembership({ membershipId: item.membership.id, role, archived, muted });
  };

  const onDragOver = () => {
    setClosestEdge(null);
  };
  // create draggable & dropTarget elements and auto scroll
  useEffect(() => {
    const element = dragRef.current;
    const data = getDraggableItemData(item, item.membership.order, 'menuItem', itemType);
    if (!element) return;

    return combine(
      draggable({
        element,
        dragHandle: element,
        getInitialData: () => data,
        onDragStart: () => {
          setDragging(true);
        },
        onDrop: () => {
          setDragging(false);
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
        onDrag: ({ self }) => setClosestEdge(extractClosestEdge(self.data)),
        onDrop: () => onDragOver(),
        onDragLeave: () => onDragOver(),
      }),
    );
  }, [item, menu]);

  // monitoring drop event
  useEffect(() => {
    return monitorForElements({
      canMonitor({ source }) {
        return isPageData(source.data) && source.data.item.id === item.id;
      },
      onDrop({ location }) {
        const target = location.current.dropTargets[0];
        if (!target) return;
        const targetData = target.data;
        if (isPageData(targetData)) {
          const closestEdgeOfTarget: Edge | null = extractClosestEdge(targetData);
          const targetTaskIndex = data.findIndex((i) => i.id === targetData.item.id);
          const relativeTaskIndex = closestEdgeOfTarget === 'top' ? targetTaskIndex + 1 : targetTaskIndex - 1;

          const relativeTask = data[relativeTaskIndex];
          let newOrder: number;

          if (relativeTask === undefined || relativeTask.membership.order === targetData.order) {
            newOrder = closestEdgeOfTarget === 'top' ? targetData.order / 2 : targetData.order + 1;
          } else if (relativeTask.id === item.id) {
            newOrder = item.membership.order;
          } else {
            newOrder = (relativeTask.membership.order + targetData.order) / 2;
          }

          updateMembership({ membershipId: item.membership.id, order: newOrder });
        }
      },
    });
  }, [item]);

  return (
    <div key={item.id} className="relative my-1" ref={dragRef}>
      <motion.div
        layoutId={`sheet-menu-item-${item.id}`}
        ref={isItemArchived ? undefined : dragRef}
        style={{ opacity: `${dragging ? 0.3 : 1}` }}
        className={`group flex relative items-center ${parentItemSlug ? 'h-12 relative menu-item-sub' : 'h-14 '} w-full p-0 pr-2 justify-start rounded  focus:outline-none
      ring-inset ring-muted/25 focus:ring-foreground hover:bg-accent/50 hover:text-accent-foreground
      ${!isItemArchived && 'ring-1 cursor-grab'} `}
      >
        <AvatarWrap
          className={`${parentItemSlug ? 'my-2 mx-3 h-8 w-8 text-xs' : 'm-2'} ${isItemArchived && 'opacity-70'}`}
          type={itemType}
          id={item.id}
          name={item.name}
          url={item.thumbnailUrl}
        />
        <div className="truncate grow py-2 pl-1 text-left">
          <div className={`truncate ${parentItemSlug ? 'text-sm' : 'text-base mb-1'} leading-5 ${isItemArchived && 'opacity-70'}`}>{item.name}</div>
          <div className="flex items-center gap-4 transition-opacity delay-500">
            <Button
              variant="link"
              size="sm"
              className="p-0 font-light text-xs h-4 leading-3 opacity-80 group-hover:opacity-100"
              aria-label="Toggle archive"
              onClick={() => itemOptionStatesHandle('archive')}
            >
              {isItemArchived ? (
                <>
                  <ArchiveRestore size={parentItemSlug ? 12 : 14} className="mr-1" /> {t('common:restore')}
                </>
              ) : (
                <>
                  <Archive size={parentItemSlug ? 12 : 14} className="mr-1" />
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
                  <Bell size={parentItemSlug ? 12 : 14} className="mr-1" />
                  {t('common:unmute')}
                </>
              ) : (
                <>
                  <BellOff size={parentItemSlug ? 12 : 14} className="mr-1" />
                  {t('common:mute')}
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
      {closestEdge && <DropIndicator className="h-0.5 w-full" edge={closestEdge} gap={0.35} />}
    </div>
  );
};
