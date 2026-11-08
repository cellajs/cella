import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useRef } from 'react';
import { getRelativeOrder } from 'shared/utils/display-order';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import type { UserMenuItem } from '~/modules/me/types';
import { buildMembershipUpdate } from '~/modules/memberships/build-membership-update';
import { canShowNow, useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { menuListOpenMs } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { isHiddenDropData, isMenuItemDragData, menuGroup, sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';

/** The display order `item` takes placed at `edge` of `target`, among the siblings its list orders it in. */
const menuItemOrder = (siblings: UserMenuItem[], item: UserMenuItem, target: UserMenuItem, edge: 'top' | 'bottom') =>
  getRelativeOrder(
    siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.membership.displayOrder })),
    target.membership.displayOrder,
    item.id,
    edge,
  );

interface MenuRowMovesOptions {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted. */
  siblings: UserMenuItem[];
  /** Every row of its list, active and hidden. */
  listItems: UserMenuItem[];
  /** Runs before it is hidden; true when the move has to wait, for the hidden list to open or its submenu to fold. */
  prepareHide?: () => boolean;
}

/** Everything that writes a menu row's order, hide and mute, whichever way a person asks for it. */
export function useMenuRowMoves({ item, siblings, listItems, prepareHide }: MenuRowMovesOptions) {
  const isOnline = useOnlineManager();
  const { mutate: updateMembership, status } = useMemberUpdateMutation();
  const isWaitingToCrossRef = useRef(false);

  const { hidden: isHidden, displayOrder: currentOrder, muted } = item.membership;

  const cross = (displayOrder?: number) => {
    const hidden = !isHidden;
    if ((!hidden && !canShowNow()) || isWaitingToCrossRef.current) return;

    followReorderFocus(item.id);
    const update = buildMembershipUpdate(item, displayOrder === undefined ? { hidden } : { hidden, displayOrder });
    // One step at a time: a closed Hidden list opens and a submenu folds before the row travels
    if (hidden && prepareHide?.()) {
      isWaitingToCrossRef.current = true;
      setTimeout(() => {
        isWaitingToCrossRef.current = false;
        updateMembership(update);
      }, menuListOpenMs);
    } else {
      updateMembership(update);
    }
  };

  const move = (step: -1 | 1) => {
    const target = siblings[siblings.findIndex((sibling) => sibling.id === item.id) + step];
    if (!target) return;
    updateMembership(buildMembershipUpdate(item, { displayOrder: menuItemOrder(siblings, item, target, step < 0 ? 'top' : 'bottom') }));
  };

  // Active and hidden rows read as one list, with Hidden between them
  const moveAcross = (step: -1 | 1) => {
    if (step === (isHidden ? -1 : 1)) cross();
  };

  const dropOn = (target: Record<string | symbol, unknown>) => {
    if (isHiddenDropData(target)) return cross();
    if (!isMenuItemDragData(target)) return;
    const targetGroup = menuGroup(target.item);
    const isSameList = targetGroup === menuGroup(item);
    const list = isSameList ? siblings : sortAndFilterMenu(listItems, targetGroup);
    const displayOrder = menuItemOrder(list, item, target.item, extractClosestEdge(target) === 'top' ? 'top' : 'bottom');
    if (!isSameList) cross(displayOrder);
    else if (displayOrder !== currentOrder) updateMembership(buildMembershipUpdate(item, { displayOrder }));
  };

  return {
    isSaving: status === 'pending' && isOnline,
    move,
    moveAcross,
    crossHidden: () => cross(),
    dropOn,
    toggleMuted: () => updateMembership(buildMembershipUpdate(item, { muted: !muted })),
  };
}

export type MenuRowMoves = ReturnType<typeof useMenuRowMoves>;
