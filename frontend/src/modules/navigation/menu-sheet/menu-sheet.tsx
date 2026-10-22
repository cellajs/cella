import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import { Spinner } from '~/modules/common/spinner';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { buildMembershipUpdate } from '~/modules/navigation/menu-sheet/helpers/build-membership-update';
import { getRelativeItemOrder } from '~/modules/navigation/menu-sheet/helpers/get-relative-item-order';
import { isPageData } from '~/modules/navigation/menu-sheet/helpers/is-page-data';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useUserStore } from '~/modules/user/user-store';

export function MenuSheet() {
  const user = useUserStore((state) => state.user);
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

          await mutateAsync(buildMembershipUpdate(sourceItem, { displayOrder: newOrder }));
        },
      }),
    ];

    return combine(...cleanups);
  }, [menu]);

  if (isLoading || !user) return <Spinner />;

  const renderedSections = appConfig.menuStructure
    .map(({ entityType }) => {
      const menuData = menu[entityType];
      const menuSection = getMenuSection(entityType);
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
