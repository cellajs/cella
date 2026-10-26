import type { UserMenuItem } from '~/modules/me/types';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';

/**
 * The unseen count an entry of `item` shows: 0 while muted, else its own count as a grouping channel plus its
 * submenu's while `submenuShown` is false, since those rows are not on screen to show theirs.
 */
export function useMenuItemUnseenCount(item: UserMenuItem, submenuShown: boolean) {
  const channelIds = [
    ...(seenGroupingChannelTypes.has(item.entityType) ? [item.id] : []),
    ...(!submenuShown && item.submenu ? item.submenu.map((sub) => sub.id) : []),
  ];
  const unseenCount = useUnseenCount(channelIds);

  return item.membership.muted ? 0 : unseenCount;
}
