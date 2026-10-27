import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getMenuSection } from '~/lib/entity-modules';
import { ContentKeyTransition } from '~/modules/common/sheeter/content-key-transition';
import { Spinner } from '~/modules/common/spinner';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { MenuSheetOrganization } from '~/modules/navigation/menu-sheet/organization-menu';
import { OrganizationSwitcher } from '~/modules/navigation/menu-sheet/organization-switcher';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { useRouteOrganizationId } from '~/modules/navigation/use-route-organization-id';
import { useUserStore } from '~/modules/user/user-store';

const { navBar, menu: menuMode } = appConfig.navigation;
const isMenuPerOrganization = menuMode === 'perOrganization';

/**
 * The organization a menu per organization holds. Picked with a nav bar button, it is that button's; picked with the
 * switcher, the switcher's pick, else the page's, else the last one opened, else the first.
 */
function pickOrganization(organizations: UserMenuItem[], hasOrganizationButtons: boolean, candidateIds: (string | null | undefined)[]) {
  const ids = hasOrganizationButtons ? candidateIds.slice(0, 1) : candidateIds;
  for (const id of ids) {
    const organization = id && organizations.find((item) => item.id === id);
    if (organization) return organization;
  }
  return hasOrganizationButtons ? undefined : sortAndFilterMenu(organizations, false)[0];
}

export function MenuSheet() {
  const user = useUserStore((state) => state.user);
  const isMobile = useBreakpointBelow('sm', false);
  const navSheetOrganizationId = useNavigationStore((state) => state.navSheetOrganizationId);
  const lastOrganizationId = useNavigationStore((state) => state.lastOrganizationId);
  // Only a desktop nav bar holds organization buttons; elsewhere the switcher picks
  const hasOrganizationButtons = navBar && !isMobile;

  const { menu, isLoading } = useMenu(user?.id);

  const organizations = menuOrganizations(menu);
  const routeOrganizationId = useRouteOrganizationId(organizations);

  if (isLoading || !user) return <Spinner />;

  const organization = isMenuPerOrganization
    ? pickOrganization(organizations, hasOrganizationButtons, [navSheetOrganizationId, routeOrganizationId, lastOrganizationId])
    : undefined;

  const menuSections = appConfig.menuStructure.flatMap(({ entityType }) => {
    const menuSection = getMenuSection(entityType);
    return menuSection ? [{ entityType, menuSection }] : [];
  });
  const renderedSections = menuSections.map(({ entityType, menuSection }) => (
    <MenuSheetSection key={entityType} options={menuSection} items={menu[entityType]} isCollapsible={menuSections.length > 1} />
  ));

  // The header, switcher and panels stay while the organization, or the full menu, fades in between them
  return (
    <NavSheetFrame panels>
      <MenuSheetHeader />
      {organization && !hasOrganizationButtons && <OrganizationSwitcher organization={organization} />}
      <ContentKeyTransition contentKey={organization?.id ?? 'all'}>
        {organization ? <MenuSheetOrganization organization={organization} menu={menu} hasSwitcher={!hasOrganizationButtons} /> : renderedSections}
      </ContentKeyTransition>
    </NavSheetFrame>
  );
}
