import { useParams } from '@tanstack/react-router';
import { menuSections } from 'shared';
import { getMenuSection } from '~/lib/entity-modules';
import type { UserMenu, UserMenuItem } from '~/modules/me/types';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import type { MenuSectionOptions } from '~/modules/navigation/menu-sheet/section';
import { channelRouteConfig } from '~/routes-config';

/** The menu's organizations, hidden ones included, whichever menu section lists them. */
export const menuOrganizations = (menu: UserMenu): UserMenuItem[] =>
  Object.values(menu).flatMap((items) => items.filter((item) => item.entityType === 'organization'));

/** The id of the organization among `organizations` whose pages are open, matched on its route param: a slug or an id. */
export function useRouteOrganizationId(organizations: UserMenuItem[]): string | undefined {
  const params = useParams({ strict: false }) as Record<string, string | undefined>;
  const idOrSlug = params[channelRouteConfig.organization.paramName];
  if (!idOrSlug) return undefined;

  return organizations.find((item) => item.tenantId === params.tenantId && (item.slug === idOrSlug || item.id === idOrSlug))?.id;
}

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
  return hasOrganizationButtons ? undefined : sortAndFilterMenu(organizations, 'active')[0];
}

/** The menu sections of one organization: its submenu, and the items of every other section that belong to it. */
export function organizationSections(organization: UserMenuItem, menu: UserMenu) {
  const menuItems = Object.values(menu).flat();

  return menuSections.flatMap(({ entityType, subentityType }) => {
    const sectionType = entityType === 'organization' ? subentityType : entityType;
    const options: MenuSectionOptions | undefined = sectionType ? getMenuSection(sectionType) : undefined;
    if (!options) return [];

    const items =
      entityType === 'organization'
        ? (organization.submenu ?? [])
        : menuItems.filter((item) => item.entityType === entityType && item.membership.organizationId === organization.id);
    // Nothing to list and nothing to create: the section would hold its empty placeholder only
    if (!items.length && !options.createAction) return [];
    return [{ options, items }];
  });
}
