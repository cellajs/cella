import { useMatch } from '@tanstack/react-router';
import { EllipsisIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { CountBadge } from '~/modules/common/count-badge';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import type { UserMenuItem } from '~/modules/me/types';
import { menuOrganizations, useRouteOrganizationId } from '~/modules/navigation/menu-sheet/helpers/menu-organizations';
import { sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';
import { useMenu } from '~/modules/navigation/menu-sheet/helpers/use-menu';
import { useOrganizationUnseenCounts } from '~/modules/navigation/menu-sheet/helpers/use-menu-item-unseen-count';
import { SidebarNavButton } from '~/modules/navigation/nav-buttons';
import { closeNavSheet } from '~/modules/navigation/nav-sheet';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import type { TriggerNavItemFn, TriggerOrganizationFn } from '~/modules/navigation/types';
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
  isCollapsed: boolean;
  onClick: TriggerOrganizationFn;
}

function SidebarOrganizationButton({ organization, unseenCount, isActive, isCurrent, isCollapsed, onClick }: SidebarOrganizationButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <SidebarNavButton
      ref={buttonRef}
      label={organization.name}
      {...{ isCollapsed, isActive, isCurrent }}
      onClick={() => onClick(organization, buttonRef)}
      className="relative"
      itemClassName="pb-0"
      // Its right edge stays put and a longer count grows left: the button clips what passes its edge
      badge={unseenCount > 0 && <CountBadge count={unseenCount} className="absolute top-2 left-12 -translate-x-full" />}
    >
      <EntityAvatar
        // An outline, not a ring: its offset stays transparent over the button's open fill
        className={cn(
          'size-8 shrink-0 transition-transform group-hover:scale-110',
          isCurrent && 'outline-primary outline-2 outline-offset-2 group-focus-visible:outline-none',
          // Only the organization you are in, or are opening, shows its color
          !isCurrent &&
            !isActive &&
            'pointer-fine:group-[:not(:hover,:focus-visible)]:resting-avatar pointer-coarse:group-[:not(:focus-visible)]:resting-avatar',
        )}
        type={organization.entityType}
        id={organization.id}
        name={organization.name}
        url={organization.thumbnailUrl}
      />
    </SidebarNavButton>
  );
}

interface SidebarOrganizationsButtonProps {
  isCollapsed: boolean;
  /** The organizations page is open. */
  isCurrent: boolean;
  onClick: TriggerNavItemFn;
}

/** Ends the rail's organizations: the page listing them all, where one is created, hidden or reordered, and the only button there for a user who has none yet. */
function SidebarOrganizationsButton({ isCollapsed, isCurrent, onClick }: SidebarOrganizationsButtonProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <SidebarNavButton
      ref={buttonRef}
      label={t('c:organizations')}
      {...{ isCollapsed, isCurrent }}
      onClick={() => {
        // A docked menu sheet closes too: its page stands in for an organization's menu sheet
        closeNavSheet();
        onClick('organizations', buttonRef);
      }}
      itemClassName="pb-0"
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-110',
          isCurrent && 'outline-primary outline-2 outline-offset-2 group-focus-visible:outline-none',
        )}
      >
        {/* The nav icons' rendered stroke: theirs is drawn at size-5, this one at size-4 */}
        <EllipsisIcon className="size-4" strokeWidth={(appConfig.theme.strokeWidth * 5) / 4} />
      </span>
    </SidebarNavButton>
  );
}

interface SidebarOrganizationButtonsProps {
  isCollapsed: boolean;
  onClick: TriggerOrganizationFn;
  onNavItemClick: TriggerNavItemFn;
}

/** A rail button per active organization membership in menu order, scrolling on its own once the rail runs out of room, then the organizations page's button. */
export function SidebarOrganizationButtons({ isCollapsed, onClick, onNavItemClick }: SidebarOrganizationButtonsProps) {
  const user = useUserStore((state) => state.user);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const navSheetOrganizationId = useNavigationStore((state) => state.navSheetOrganizationId);
  const isOrganizationsPage = useMatch({ from: '/_app/organizations', shouldThrow: false, select: () => true }) ?? false;

  const { menu } = useMenu(user?.id);
  const organizations = menuOrganizations(menu);
  const routeOrganizationId = useRouteOrganizationId(organizations);
  const unseenCounts = useOrganizationUnseenCounts(menu);

  // An open menu sheet or the organizations page shows these counts itself: the full menu and the page on their rows, an organization's sheet on its header and sections
  const listsCounts = (navSheetOpen === 'menu' && !navSheetOrganizationId) || isOrganizationsPage;

  return (
    <SidebarMenu className="no-scrollbar min-h-0 gap-0 overflow-y-auto">
      {sortAndFilterMenu(organizations, 'active').map((organization) => {
        const isActive = navSheetOpen === 'menu' && navSheetOrganizationId === organization.id;
        return (
          <SidebarOrganizationButton
            key={organization.id}
            {...{ organization, isActive, isCollapsed, onClick }}
            unseenCount={listsCounts || isActive ? 0 : (unseenCounts.get(organization.id) ?? 0)}
            isCurrent={organization.id === routeOrganizationId}
          />
        );
      })}
      <SidebarOrganizationsButton isCollapsed={isCollapsed} isCurrent={isOrganizationsPage} onClick={onNavItemClick} />
    </SidebarMenu>
  );
}
