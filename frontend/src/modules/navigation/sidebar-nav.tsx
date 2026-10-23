import { type CSSProperties, Suspense } from 'react';
import { appConfig } from 'shared';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointAbove } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { navSheetId, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { FocusBridge, FocusTarget } from '~/modules/navigation/focus-bridge';
import { SidebarNavItemButton } from '~/modules/navigation/nav-buttons';
import { navItems } from '~/modules/navigation/nav-items';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { StopImpersonation } from '~/modules/navigation/stop-impersonation';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarMenu } from '~/modules/ui/sidebar';
import { lazyNamed } from '~/utils/lazy-named';

const DebugDropdown = __DEV_TOOLS__ ? lazyNamed(() => import('~/modules/common/debug-dropdown'), 'DebugDropdown') : () => null;

const { hasSidebarTextLabels, sidebarWidthExpanded, sidebarWidthCollapsed, sheetPanelWidth } = appConfig.theme.navigation;

const baseNavItems: NavItem[] = navItems.filter((item: NavItem) => item.type === 'base');
const footerNavItems: NavItem[] = navItems.filter((item: NavItem) => item.type === 'footer');

interface SidebarNavProps {
  onNavItemClick: TriggerNavItemFn;
}

export function SidebarNav({ onNavItemClick }: SidebarNavProps) {
  const { hasStarted } = useMountedState();
  const isDesktop = useBreakpointAbove('2xl');

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepNavOpen = useNavigationStore((state) => state.keepNavOpen);

  const navSheetExists = useSheeter((state) => state.sheets.some((sheet) => sheet.id === navSheetId && sheet.open));

  useBodyClass({ 'keep-nav-open': keepNavOpen });
  useBodyClass({ 'nav-sheet-open': navSheetExists });

  const isExpanded = hasSidebarTextLabels && isDesktop && !navSheetOpen;
  const isOverlay = !isDesktop || !keepNavOpen;

  // The spacer includes the sheet width when the sheet is open and not overlaying.
  const sidebarWidth = isExpanded ? sidebarWidthExpanded : sidebarWidthCollapsed;
  const spacerWidth = isOverlay
    ? hasSidebarTextLabels && isDesktop
      ? sidebarWidthExpanded
      : sidebarWidthCollapsed
    : navSheetExists
      ? `calc(${sidebarWidth} + ${sheetPanelWidth})`
      : sidebarWidth;

  const cssVars = { '--sidebar-w': sidebarWidth, '--spacer-w': spacerWidth } as CSSProperties;

  return (
    <div className="contents" style={cssVars}>
      {/* Pushes content; data-started keeps the width transition off on initial mount. */}
      <div
        data-slot="sidebar-spacer"
        data-started={hasStarted}
        className="w-(--spacer-w) transition-[width] duration-300 ease-out focus-view:hidden data-[started=false]:transition-none"
      />
      <Sidebar
        id="sidebar-nav"
        collapsible="none"
        data-started={hasStarted}
        className="fixed inset-y-0 left-0 z-100 w-(--sidebar-w) transition-[width] duration-200 ease-linear focus-view:hidden data-[started=false]:-translate-x-full"
      >
        <FocusTarget target="sidebar" />
        <div className="relative flex h-full">
          <div className="flex h-full w-(--sidebar-w) flex-col overflow-hidden transition-[width] duration-200 ease-linear">
            <SidebarContent className="gap-1">
              <SidebarGroup className="p-0">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {baseNavItems.map((navItem) => (
                      <SidebarNavItemButton
                        key={navItem.id}
                        navItem={navItem}
                        isActive={navSheetOpen === navItem.id}
                        isCollapsed={!isExpanded}
                        onClick={onNavItemClick}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-0">
              <Suspense>
                <DebugDropdown className="mx-2" />
              </Suspense>
              <SidebarMenu className="gap-1">
                <StopImpersonation isCollapsed={!isExpanded} />
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
