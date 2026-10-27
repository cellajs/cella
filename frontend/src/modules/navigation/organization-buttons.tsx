import { useRef } from 'react';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { UserMenuItem } from '~/modules/me/types';
import { menuOrganizations } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/sort-and-filter-menu';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { SidebarNavButton } from '~/modules/navigation/nav-buttons';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { TriggerOrganizationFn } from '~/modules/navigation/types';
import { useRouteOrganizationId } from '~/modules/navigation/use-route-organization-id';
import { useOrganizationUnseenCounts } from '~/modules/seen/use-unseen-count';
import { SidebarMenu } from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';
import { cn } from '~/utils/cn';

interface SidebarOrganizationButtonProps {
  organization: UserMenuItem;
  /** 0 hides the badge. */
  unseenCount: number;
  /** Its menu sheet is open. */
  isActive: boolean;
  /** Its pages are open. */
  isCurrent: boolean;
  /** The rail shows icons without labels. */
  isCollapsed: boolean;
  onClick: TriggerOrganizationFn;
}

function SidebarOrganizationButton({ organization, unseenCount, isActive, isCurrent, isCollapsed, onClick }: SidebarOrganizationButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <SidebarNavButton
      ref={buttonRef}
      label={organization.name}
      isCollapsed={isCollapsed}
      isActive={isActive}
      isCurrent={isCurrent}
      onClick={() => onClick(organization, buttonRef)}
      className="relative"
      itemClassName="pb-0"
      badge={unseenCount > 0 && <CountBadge count={unseenCount} className="absolute top-2 left-8" />}
    >
      <EntityAvatar
        // An outline, not a ring: its offset stays transparent over the button's hover and open fills
        className={cn('size-8 shrink-0 transition-transform group-hover:scale-110', isCurrent && 'outline-2 outline-primary outline-offset-2')}
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
  const unseenCounts = useOrganizationUnseenCounts();

  // An open menu sheet shows these counts itself: the full menu on its rows, an organization's sheet on its header and sections
  const isFullMenuOpen = navSheetOpen === 'menu' && !navSheetOrganizationId;

  return (
    <SidebarMenu className="no-scrollbar min-h-0 gap-1 overflow-y-auto">
      {sortAndFilterMenu(organizations, false).map((organization) => {
        const isActive = navSheetOpen === 'menu' && navSheetOrganizationId === organization.id;
        return (
          <SidebarOrganizationButton
            key={organization.id}
            organization={organization}
            unseenCount={isFullMenuOpen || isActive ? 0 : (unseenCounts.get(organization.id) ?? 0)}
            isActive={isActive}
            isCurrent={organization.id === routeOrganizationId}
            isCollapsed={isCollapsed}
            onClick={onClick}
          />
        );
      })}
    </SidebarMenu>
  );
}
