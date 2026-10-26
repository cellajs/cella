import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { organizationSections } from '~/modules/navigation/menu-sheet/helpers/organization-sections';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';

/** The channel an organization's rail button lands on: the one its pages last showed while its menu still lists it, else the first its menu lists. */
export function organizationLanding(organization: UserMenuItem, menu: UserMenu, lastChannelId: string | undefined): UserMenuItem | undefined {
  const items = organizationSections(organization, menu).flatMap((section) => sortAndFilterMenu(section.items, false));
  const lastChannel = items.flatMap((item) => [item, ...(item.submenu ?? [])]).find((item) => item.id === lastChannelId && !item.membership.archived);
  return lastChannel ?? items[0];
}
