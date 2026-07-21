import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { menuSectionsSchema } from '~/menu-config';
import { Spinner } from '~/modules/common/spinner';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { getRelativeItemOrder, isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { MenuSheetPanels } from '~/modules/navigation/menu-sheet/sheet-panel';
import { useUserStore } from '~/modules/user/user-store';
import { useMenu } from './helpers/use-menu';

export const MenuSheet = () => {
  const { user } = useUserStore();
  const { mutateAsync } = useMemberUpdateMutation();

  const { menu, isLoading } = useMenu(user?.id);

  // monitoring drop event
  useEffect(() => {
    const cleanups = [
      monitorForElements({
        canMonitor({ source }) {
          return isPageData(source.data) && !source.data.item.membership.archived;
        },
        async onDrop({ source, location }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          if (!isPageData(targetData) || !isPageData(sourceData)) return;

          const { item: sourceItem } = sourceData;
          const edge: Edge | null = extractClosestEdge(targetData);
          const newOrder = getRelativeItemOrder(
            menu,
            sourceItem.entityType,
            sourceItem.membership.archived,
            sourceItem.id,
            targetData.displayOrder,
            edge,
          );

          // Exit early if displayOrder remains the same
          if (newOrder === sourceItem.membership.displayOrder) return;

          await mutateAsync({
            path: {
              id: sourceItem.membership.id,
              tenantId: sourceItem.tenantId,
              organizationId: sourceItem.membership.organizationId || sourceItem.id,
            },
            body: { displayOrder: newOrder },
            channelId: sourceItem.id,
            channelType: sourceItem.entityType,
          });
        },
      }),
    ];

    return combine(...cleanups);
  }, [menu]);

  // Show skeleton when loading or no user data yet
  if (isLoading || !user) return <Spinner />;

  const renderedSections = appConfig.menuStructure
    .map(({ entityType }) => {
      const menuData = menu[entityType];
      const menuSection = menuSectionsSchema[entityType];
      if (!menuSection) return null;

      return <MenuSheetSection key={entityType} options={menuSection} data={menuData} />;
    })
    .filter((el) => el !== null);

  return (
    <div className="group/menu flex min-h-screen w-full flex-col bg-card">
      <FocusTarget target="sheet" />

      <MenuSheetHeader />
      {renderedSections}
      <span className="mt-10" />
      <MenuSheetPanels />
      {/* Keyboard-only skip links at end of sheet */}
      <div className="flex flex-col focus-within:p-3">
        <FocusBridge direction="to-content" className="focus:relative" />
        <FocusBridge direction="to-sidebar" className="focus:relative" />
      </div>
    </div>
  );
};
