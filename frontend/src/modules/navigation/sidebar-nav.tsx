import { type CSSProperties, Suspense } from 'react';
import { appConfig } from 'shared';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { settledAfterMountMs, useDelayedFlag } from '~/hooks/use-delayed-flag';
import { navSheetId, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { SidebarNavItemButton } from '~/modules/navigation/nav-buttons';
import { navItems } from '~/modules/navigation/nav-items';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { SidebarOrganizationButtons } from '~/modules/navigation/organization-buttons';
import type { NavItem, TriggerNavItemFn, TriggerOrganizationFn } from '~/modules/navigation/types';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarMenu } from '~/modules/ui/sidebar';
import { lazyNamed } from '~/utils/lazy-named';

const DebugDropdown = __DEV_TOOLS__ ? lazyNamed(() => import('~/modules/common/debug-dropdown'), 'DebugDropdown') : () => null;

const { sidebarTextLabels, sidebarWidthExpanded, sidebarWidthCollapsed, sheetPanelWidth } = appConfig.theme.navigation;

const isMenuPerOrganization = appConfig.navigation.menu === 'perOrganization';

const baseNavItems: NavItem[] = navItems.filter((item: NavItem) => item.type === 'base');
// With a menu per organization the app icon heads their buttons, which stand in for the menu button and its unseen count
const leadNavItems = isMenuPerOrganization ? baseNavItems.filter((item) => item.id === 'home') : [];
const mainNavItems = baseNavItems.filter((item) => item.id !== 'home' && !(isMenuPerOrganization && item.id === 'menu'));
const footerNavItems: NavItem[] = navItems.filter((item: NavItem) => item.type === 'footer');

interface SidebarNavProps {
  onNavItemClick: TriggerNavItemFn;
  onOrganizationClick: TriggerOrganizationFn;
}

export function SidebarNav({ onNavItemClick, onOrganizationClick }: SidebarNavProps) {
  const hasStarted = useDelayedFlag(true, settledAfterMountMs);
  const isDesktop = useBreakpointAbove('2xl');

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const navSheetOrganizationId = useNavigationStore((state) => state.navSheetOrganizationId);
  const keepNavOpen = useNavigationStore((state) => state.keepNavOpen);

  const navSheetExists = useSheeter((state) => state.sheets.some((sheet) => sheet.id === navSheetId && sheet.open));

  const isExpanded = sidebarTextLabels && isDesktop && !navSheetOpen;
  const isOverlay = !isDesktop || !keepNavOpen;

  // The spacer includes the sheet width when the sheet is open and not overlaying.
  const sidebarWidth = isExpanded ? sidebarWidthExpanded : sidebarWidthCollapsed;
  const spacerWidth = isOverlay
    ? sidebarTextLabels && isDesktop
      ? sidebarWidthExpanded
      : sidebarWidthCollapsed
    : navSheetExists
      ? `calc(${sidebarWidth} + ${sheetPanelWidth})`
      : sidebarWidth;

  const cssVars = { '--sidebar-width': sidebarWidth, '--spacer-w': spacerWidth } as CSSProperties;

  const renderNavItem = (navItem: NavItem, itemClassName?: string) => (
    <SidebarNavItemButton
      key={navItem.id}
      navItem={navItem}
      isActive={navSheetOpen === navItem.id && !navSheetOrganizationId}
      isCollapsed={!isExpanded}
      itemClassName={itemClassName}
      onClick={onNavItemClick}
    />
  );

  return (
    <div className="contents" style={cssVars}>
      {/* data-started keeps the width transition off on initial mount */}
      <div
        data-slot="sidebar-spacer"
        data-started={hasStarted}
        className="focus-view:hidden w-(--spacer-w) transition-[width] duration-300 ease-out data-[started=false]:transition-none"
      />
      <Sidebar
        id="sidebar-nav"
        data-started={hasStarted}
        className="focus-view:hidden fixed inset-y-0 left-0 z-100 transition-[width] duration-200 ease-linear data-[started=false]:-translate-x-full"
      >
        <FocusTarget target="sidebar" />
        <div className="relative flex h-full">
          <div className="flex h-full w-(--sidebar-width) flex-col overflow-hidden transition-[width] duration-200 ease-linear">
            {/* Only the organization buttons scroll, so the buttons under them stay in view */}
            <SidebarContent className="gap-0 overflow-hidden">
              {isMenuPerOrganization && (
                <>
                  <SidebarGroup className="shrink-0 p-0">
                    <SidebarMenu className="gap-1">{leadNavItems.map((navItem) => renderNavItem(navItem, 'pb-0'))}</SidebarMenu>
                  </SidebarGroup>
                  <div className="bg-sidebar-foreground/15 more-contrast:bg-sidebar-foreground/40 mx-3 h-px shrink-0" />
                  <SidebarGroup className="min-h-0 p-0">
                    <SidebarOrganizationButtons isCollapsed={!isExpanded} onClick={onOrganizationClick} onNavItemClick={onNavItemClick} />
                  </SidebarGroup>
                  <div className="bg-sidebar-foreground/15 more-contrast:bg-sidebar-foreground/40 mx-3 h-px shrink-0" />
                </>
              )}
              <SidebarGroup className="shrink-0 p-0">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">{mainNavItems.map((navItem) => renderNavItem(navItem))}</SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-0">
              <Suspense>
                <DebugDropdown className="mx-2" />
              </Suspense>
              <SidebarMenu className="gap-1">
                {footerNavItems.map((navItem) => (
                  <SidebarNavItemButton
                    key={navItem.id}
                    navItem={navItem}
                    isActive={navSheetOpen === navItem.id}
                    isCollapsed={!isExpanded}
                    onClick={onNavItemClick}
                  />
                ))}
              </SidebarMenu>
              <FocusBridge direction="to-sheet" className="focus:m-2" />
            </SidebarFooter>
          </div>
        </div>
      </Sidebar>
    </div>
  );
}
