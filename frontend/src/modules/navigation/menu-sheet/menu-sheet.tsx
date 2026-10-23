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
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useUserStore } from '~/modules/user/user-store';

export function MenuSheet() {
  const user = useUserStore((state) => state.user);
  const { mutateAsync: updateMembership } = useMemberUpdateMutation();

  const { menu, isLoading } = useMenu(user?.id);

  useEffect(
    () =>
      monitorForElements({
        canMonitor({ source }) {
          return isMenuItemDragData(source.data) && !source.data.item.membership.archived;
        },
        async onDrop({ source, location }) {
          const target = location.current.dropTargets[0];
          if (!target) return;

          const sourceData = source.data;
          const targetData = target.data;
          if (!isMenuItemDragData(targetData) || !isMenuItemDragData(sourceData)) return;

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

          await updateMembership(buildMembershipUpdate(sourceItem, { displayOrder: newOrder }));
        },
      }),
    [menu],
  );

  if (isLoading || !user) return <Spinner />;

  const renderedSections = appConfig.menuStructure
    .map(({ entityType }) => {
      const items = menu[entityType];
      const menuSection = getMenuSection(entityType);
      if (!menuSection) return null;

      return <MenuSheetSection key={entityType} options={menuSection} items={items} />;
    })
    .filter((section) => section !== null);

  return (
    <NavSheetFrame panels>
      <MenuSheetHeader />
      {renderedSections}
    </NavSheetFrame>
  );
}
