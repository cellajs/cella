import { useRef } from 'react';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { UserMenuItem } from '~/modules/me/types';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useMenuItemUnseenCount } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { SidebarNavButton } from '~/modules/navigation/nav-buttons';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { TriggerOrganizationFn } from '~/modules/navigation/types';
import { useRouteOrganizationId } from '~/modules/navigation/use-route-organization-id';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';

interface SidebarOrganizationButtonProps {
  organization: UserMenuItem;
  /** Its menu sheet is open. */
  isActive: boolean;
  /** Its pages are open. */
  isCurrent: boolean;
  /** The rail shows icons without labels. */
  isCollapsed: boolean;
  onClick: TriggerOrganizationFn;
}

function SidebarOrganizationButton({ organization, isActive, isCurrent, isCollapsed, onClick }: SidebarOrganizationButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const unseenCount = useMenuItemUnseenCount(organization, false);

  return (
    <SidebarNavButton
      ref={buttonRef}
      label={organization.name}
      isCollapsed={isCollapsed}
      isActive={isActive}
      isCurrent={isCurrent}
      onClick={() => onClick(organization, buttonRef)}
      className="relative data-[active=true]:bg-background/50"
      badge={unseenCount > 0 && <CountBadge count={unseenCount} className="absolute top-2 left-8" />}
    >
      <EntityAvatar
        className="size-8 shrink-0 transition-transform group-hover:scale-110"
        type={organization.entityType}
        id={organization.id}
        name={organization.name}
        url={organization.thumbnailUrl}
      />
    </SidebarNavButton>
  );
}

interface SidebarOrganizationButtonsProps {
  /** The rail shows icons without labels. */
  isCollapsed: boolean;
  onClick: TriggerOrganizationFn;
}

/** A rail button per active organization membership in menu order, scrolling on its own once the rail runs out of room. */
export function SidebarOrganizationButtons({ isCollapsed, onClick }: SidebarOrganizationButtonsProps) {
  const user = useUserStore((state) => state.user);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const navSheetOrganizationId = useNavigationStore((state) => state.navSheetOrganizationId);

  const { menu } = useMenu(user?.id);
  const organizations = menuOrganizations(menu);
  const routeOrganizationId = useRouteOrganizationId(organizations);

  return (
    <SidebarMenu className="no-scrollbar min-h-0 gap-1 overflow-y-auto">
      {sortAndFilterMenu(organizations, false).map((organization) => (
        <SidebarOrganizationButton
          key={organization.id}
          organization={organization}
          isActive={navSheetOpen === 'menu' && navSheetOrganizationId === organization.id}
          isCurrent={organization.id === routeOrganizationId}
          isCollapsed={isCollapsed}
          onClick={onClick}
        />
      ))}
    </SidebarMenu>
  );
}
