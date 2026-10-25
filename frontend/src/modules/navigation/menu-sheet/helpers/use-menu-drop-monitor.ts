import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { type Edge, extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useEffect } from 'react';
import type { UserMenu } from '~/modules/me/types';
import { useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { buildMembershipUpdate } from '~/modules/navigation/menu-sheet/helpers/build-membership-update';
import { getRelativeItemOrder } from '~/modules/navigation/menu-sheet/helpers/get-relative-item-order';
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';

/** Stores the display order a menu item dropped among its siblings takes. */
export function useMenuDropMonitor(menu: UserMenu) {
  const { mutateAsync: updateMembership } = useMemberUpdateMutation();

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
}
