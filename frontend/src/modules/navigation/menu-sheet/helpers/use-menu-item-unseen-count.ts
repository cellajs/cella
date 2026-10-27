import type { UserMenuItem } from '~/modules/me/types';
import { seenGroupingChannelTypes } from '~/modules/seen/helpers';
import { useUnseenCount } from '~/modules/seen/use-unseen-count';

/** The channels a menu row counts unseen content in: its own as a grouping channel unless muted, plus, with `includeSubmenu`, its non-muted, non-archived sub-rows. */
export const menuUnseenChannelIds = (item: UserMenuItem, includeSubmenu: boolean) => [
  ...(seenGroupingChannelTypes.has(item.entityType) && !item.membership.muted ? [item.id] : []),
  ...(includeSubmenu ? (item.submenu ?? []).filter((sub) => !sub.membership.muted && !sub.membership.archived).map((sub) => sub.id) : []),
];

/** The unseen count a menu row shows: its sub-rows' too while `submenuShown` is false, since those rows are not on screen to show theirs. */
export function useMenuItemUnseenCount(item: UserMenuItem, submenuShown: boolean) {
  return useUnseenCount(menuUnseenChannelIds(item, !submenuShown));
}
