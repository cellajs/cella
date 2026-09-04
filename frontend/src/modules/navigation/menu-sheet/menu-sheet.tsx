import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { menuSectionsSchema } from '~/menu-config';
import { Spinner } from '~/modules/common/spinner';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { getRelativeItemOrder, isPageData } from '~/modules/navigation/menu-sheet/helpers';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useUserStore } from '~/modules/user/user-store';
import { useMenu } from './helpers/use-menu';

export function MenuSheet() {
  const { user } = useUserStore();
  const { mutateAsync } = useMemberUpdateMutation();

  const { menu, isLoading } = useMenu(user?.id);

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
    <NavSheetFrame panels>
      <MenuSheetHeader />
      {renderedSections}
    </NavSheetFrame>
  );
}
