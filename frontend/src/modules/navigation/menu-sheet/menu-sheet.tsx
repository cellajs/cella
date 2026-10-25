import { useState } from 'react';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { getMenuSection } from '~/lib/entity-modules';
import { Spinner } from '~/modules/common/spinner';
import type { UserMenuItem } from '~/modules/me/types';
import { MenuSheetHeader } from '~/modules/navigation/menu-sheet/header';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useMenuDropMonitor } from '~/modules/navigation/menu-sheet/helpers/use-menu-drop-monitor';
import { MenuSheetOrganization } from '~/modules/navigation/menu-sheet/organization-menu';
import { OrganizationSwitcher } from '~/modules/navigation/menu-sheet/organization-switcher';
import { MenuSheetSection } from '~/modules/navigation/menu-sheet/section';
import { NavSheetFrame } from '~/modules/navigation/nav-sheet-frame';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { useRouteOrganizationId } from '~/modules/navigation/use-route-organization-id';
import { useUserStore } from '~/modules/user/user-store';

const hasOrganizationRail = appConfig.navSidebarMode === 'organizations';

/**
 * The organization a menu sheet holds alone in the organization rail mode. On desktop it is the one whose rail button
 * opened the sheet; on mobile the switcher's pick, else the page's, else the last one opened, else the first.
 */
function pickOrganization(organizations: UserMenuItem[], isMobile: boolean, candidateIds: (string | null | undefined)[]) {
  const ids = isMobile ? candidateIds : candidateIds.slice(0, 1);
  for (const id of ids) {
    const organization = id && organizations.find((item) => item.id === id);
    if (organization) return organization;
  }
  return isMobile ? sortAndFilterMenu(organizations, false)[0] : undefined;
}

export function MenuSheet() {
  const user = useUserStore((state) => state.user);
  const isMobile = useBreakpointBelow('sm', false);
  const navSheetOrganizationId = useNavigationStore((state) => state.navSheetOrganizationId);
  const lastOrganizationId = useNavigationStore((state) => state.lastOrganizationId);
  // Mobile has no full menu to manage the organizations in, so the sheet turns to it in place
  const [isManaging, setIsManaging] = useState(false);

  const { menu, isLoading } = useMenu(user?.id);
  useMenuDropMonitor(menu);

  const organizations = menuOrganizations(menu);
  const routeOrganizationId = useRouteOrganizationId(organizations);

  if (isLoading || !user) return <Spinner />;

  const organization =
    hasOrganizationRail && !isManaging
      ? pickOrganization(organizations, isMobile, [navSheetOrganizationId, routeOrganizationId, lastOrganizationId])
      : undefined;

  if (organization) {
    const startManaging = () => {
      navigationStore.getState().setSectionOpen('organization', true);
      setIsManaging(true);
    };

    return (
      <NavSheetFrame panels>
        <MenuSheetHeader />
        {isMobile && <OrganizationSwitcher organization={organization} onManage={startManaging} />}
        <MenuSheetOrganization organization={organization} menu={menu} />
      </NavSheetFrame>
    );
  }

  const renderedSections = appConfig.menuStructure
    .filter(({ entityType }) => !isManaging || entityType === 'organization')
    .map(({ entityType }) => {
      const items = menu[entityType];
      const menuSection = getMenuSection(entityType);
      if (!menuSection) return null;

      return (
        <MenuSheetSection
          key={entityType}
          options={menuSection}
          items={items}
          initialEditing={isManaging}
          onEditingEnd={isManaging ? () => setIsManaging(false) : undefined}
        />
      );
    })
    .filter((section) => section !== null);

  return (
    <NavSheetFrame panels>
      <MenuSheetHeader />
      {renderedSections}
    </NavSheetFrame>
  );
}
