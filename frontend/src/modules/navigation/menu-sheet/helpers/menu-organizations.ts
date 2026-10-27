import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';

/** The menu's organizations, archived ones included, whichever menu section lists them. */
export const menuOrganizations = (menu: UserMenu): UserMenuItem[] =>
  Object.values(menu).flatMap((items) => items.filter((item) => item.entityType === 'organization'));

/**
 * The organization a menu per organization holds. Picked with a nav bar button, it is that button's; picked with the
 * switcher, the switcher's pick, else the page's, else the last one opened, else the first.
 */
export function pickMenuOrganization(organizations: UserMenuItem[], hasOrganizationButtons: boolean, candidateIds: (string | null | undefined)[]) {
  const ids = hasOrganizationButtons ? candidateIds.slice(0, 1) : candidateIds;
  for (const id of ids) {
    const organization = id && organizations.find((item) => item.id === id);
    if (organization) return organization;
  }
  return hasOrganizationButtons ? undefined : sortAndFilterMenu(organizations, false)[0];
}
