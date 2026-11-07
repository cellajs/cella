import { useQuery } from '@tanstack/react-query';
import { seenGroupingChannelTypes } from 'shared';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { menuOrganizations, organizationSections } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { sumUnseenCounts, useUnseenCount } from '~/modules/seen/use-unseen-count';
import { useUserStore } from '~/modules/user/user-store';

/** The channels a menu row counts unseen content in: its own as a grouping channel unless muted, plus, with `includeSubmenu`, its non-muted, non-archived sub-rows. */
export const menuUnseenChannelIds = (item: UserMenuItem, includeSubmenu: boolean) => [
  ...(seenGroupingChannelTypes.has(item.entityType) && !item.membership.muted ? [item.id] : []),
  ...(includeSubmenu ? (item.submenu ?? []).filter((sub) => !sub.membership.muted && !sub.membership.archived).map((sub) => sub.id) : []),
];

/** The channels a list of rows counts past its own section: an archived row's stay on its archived toggle. */
export const activeUnseenChannelIds = (items: UserMenuItem[]) =>
  items.filter((item) => !item.membership.archived).flatMap((item) => menuUnseenChannelIds(item, true));

/**
 * The channels an organization counts in: its own, and what the active rows of its menu sheet count.
 * @public
 */
export const organizationUnseenChannelIds = (organization: UserMenuItem, menu: UserMenu) => [
  ...menuUnseenChannelIds(organization, false),
  ...organizationSections(organization, menu).flatMap(({ items }) => activeUnseenChannelIds(items)),
];

/** The unseen count a menu row shows: its sub-rows' too while `submenuShown` is false, since those rows are not on screen to show theirs. */
export const useMenuItemUnseenCount = (item: UserMenuItem, submenuShown: boolean) => useUnseenCount(menuUnseenChannelIds(item, !submenuShown));

/** Unseen counts by organization id, read off the menu so the rail and the switcher add up to what each menu sheet shows. */
export function useOrganizationUnseenCounts(menu: UserMenu) {
  const { data: unseenCounts } = useQuery(unseenCountsQueryOptions());

  const counts = new Map<string, number>();
  if (!unseenCounts) return counts;

  for (const organization of menuOrganizations(menu)) {
    const count = sumUnseenCounts(unseenCounts, organizationUnseenChannelIds(organization, menu));
    if (count) counts.set(organization.id, count);
  }
  return counts;
}

/** What the active rows of a whole menu count, for the menu button of a menu that holds every organization. */
export function useTotalUnseenCount() {
  const userId = useUserStore((state) => state.user?.id);
  const { menu } = useMenu(userId);
  return useUnseenCount(Object.values(menu).flatMap((items) => activeUnseenChannelIds(items)));
}
