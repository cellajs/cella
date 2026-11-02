import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { useRef } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { followReorderFocus } from '~/modules/common/reorder-handle/reorder-handle';
import type { UserMenuItem } from '~/modules/me/types';
import { buildMembershipUpdate } from '~/modules/memberships/build-membership-update';
import { canRestoreNow, useMemberUpdateMutation } from '~/modules/memberships/query-mutations';
import { isArchivedDropData } from '~/modules/navigation/menu-sheet/helpers/is-archived-drop-data';
import { isMenuItemDragData } from '~/modules/navigation/menu-sheet/helpers/is-menu-item-drag-data';
import { menuItemOrder } from '~/modules/navigation/menu-sheet/helpers/menu-item-order';
import { menuListOpenMs } from '~/modules/navigation/menu-sheet/helpers/menu-list-motion';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';

interface MenuRowMovesOptions {
  item: UserMenuItem;
  /** The list this item is ordered in, sorted. */
  siblings: UserMenuItem[];
  /** Every row of its list, active and archived. */
  listItems: UserMenuItem[];
  /** Runs before it is archived; true when the move has to wait, for the archived list to open or its submenu to fold. */
  prepareArchive?: () => boolean;
}

/** Everything that writes a menu row's order, archive and mute, whichever way a person asks for it. */
export function useMenuRowMoves({ item, siblings, listItems, prepareArchive }: MenuRowMovesOptions) {
  const isOnline = useOnlineManager();
  const { mutate: updateMembership, status } = useMemberUpdateMutation();
  const isWaitingToCrossRef = useRef(false);

  const { archived: isArchived, displayOrder: currentOrder, muted } = item.membership;

  const cross = (displayOrder?: number) => {
    const archived = !isArchived;
    if ((!archived && !canRestoreNow()) || isWaitingToCrossRef.current) return;

    followReorderFocus(item.id);
    const update = buildMembershipUpdate(item, displayOrder === undefined ? { archived } : { archived, displayOrder });
    // One step at a time: a closed archive opens and a submenu folds before the row travels
    if (archived && prepareArchive?.()) {
      isWaitingToCrossRef.current = true;
      setTimeout(() => {
        isWaitingToCrossRef.current = false;
        updateMembership(update);
      }, menuListOpenMs);
    } else updateMembership(update);
  };

  const move = (step: -1 | 1) => {
    const target = siblings[siblings.findIndex((sibling) => sibling.id === item.id) + step];
    if (!target) return;
    updateMembership(buildMembershipUpdate(item, { displayOrder: menuItemOrder(siblings, item, target, step < 0 ? 'top' : 'bottom') }));
  };

  // Active and archived rows read as one list, with Archived between them
  const moveAcross = (step: -1 | 1) => {
    if (step === (isArchived ? -1 : 1)) cross();
  };

  const dropOn = (target: Record<string | symbol, unknown>) => {
    if (isArchivedDropData(target)) return cross();
    if (!isMenuItemDragData(target)) return;
    const isSameList = target.item.membership.archived === isArchived;
    const list = isSameList ? siblings : sortAndFilterMenu(listItems, target.item.membership.archived);
    const displayOrder = menuItemOrder(list, item, target.item, extractClosestEdge(target) === 'top' ? 'top' : 'bottom');
    if (!isSameList) cross(displayOrder);
    else if (displayOrder !== currentOrder) updateMembership(buildMembershipUpdate(item, { displayOrder }));
  };

  return {
    isSaving: status === 'pending' && isOnline,
    move,
    moveAcross,
    crossArchive: () => cross(),
    dropOn,
    toggleMuted: () => updateMembership(buildMembershipUpdate(item, { muted: !muted })),
  };
}

export type MenuRowMoves = ReturnType<typeof useMenuRowMoves>;
