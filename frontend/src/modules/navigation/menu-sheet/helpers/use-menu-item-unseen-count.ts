import type { UserMenuItem } from '~/modules/me/types';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';

/**
 * The unseen count an entry of `item` shows: its own as a grouping channel unless muted, plus that of its non-muted,
 * non-archived submenu rows while `submenuShown` is false, since those rows are not on screen to show theirs.
 */
export function useMenuItemUnseenCount(item: UserMenuItem, submenuShown: boolean) {
  const channelIds = [
    ...(seenGroupingChannelTypes.has(item.entityType) && !item.membership.muted ? [item.id] : []),
    ...(submenuShown ? [] : (item.submenu ?? []).filter((sub) => !sub.membership.muted && !sub.membership.archived).map((sub) => sub.id)),
  ];
  return useUnseenCount(channelIds);
}
