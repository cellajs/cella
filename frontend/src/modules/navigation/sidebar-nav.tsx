import type { CSSProperties } from 'react';
import { lazy, Suspense } from 'react';
import { appConfig } from 'shared';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMountedState } from '~/hooks/use-mounted-state';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { NavButton } from '~/modules/navigation/nav-buttons';
import { StopImpersonation } from '~/modules/navigation/stop-impersonation';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from '~/modules/ui/sidebar';
import { navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';

const DebugDropdown =
  appConfig.mode !== 'production' ? lazy(() => import('~/modules/common/debug-dropdown')) : () => null;

// Sidebar dimensions from config
const { hasSidebarTextLabels, sidebarWidthExpanded, sidebarWidthCollapsed, sheetPanelWidth } =
  appConfig.theme.navigation;

// Cached base nav items
let baseNavItems: NavItem[] | null = null;
function getBaseNavItems() {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
}

// Cached footer nav items
let footerNavItems: NavItem[] | null = null;
function getFooterNavItems() {
  if (!footerNavItems) footerNavItems = navItems.filter(({ type }) => (type as string) === 'footer');
  return footerNavItems;
}

interface SidebarNavProps {
  triggerNavItem: TriggerNavItemFn;
}

/**
 * Sidebar navigation: icon bar + sheet panel.
 * Widths are computed and set as CSS custom properties.
 * Data attributes control non-width styling (opacity, position, pointer-events).
 */
export function SidebarNav({ triggerNavItem }: SidebarNavProps) {
  const { hasStarted } = useMountedState();
  const isDesktop = useBreakpoints('min', 'xl');

  const theme = useUIStore((state) => state.theme);
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepNavOpen = useNavigationStore((state) => state.keepNavOpen);

  // Check if nav-sheet is open via useSheeter
  const navSheetExists = useSheeter((state) => state.sheets.some((s) => s.id === 'nav-sheet' && s.open));

  useBodyClass({ 'keep-nav-open': keepNavOpen });
  useBodyClass({ 'nav-sheet-open': navSheetExists });

  // State
  const isCollapsed = !!navSheetOpen;
  const isExpanded = hasSidebarTextLabels && isDesktop && !isCollapsed;
  const isOverlay = !isDesktop || !keepNavOpen;

  // Compute widths - spacer includes sheet width when not overlay and nav-sheet is open
  const iconBarWidth = isExpanded ? sidebarWidthExpanded : sidebarWidthCollapsed;
  const sidebarWidth = iconBarWidth;
  const spacerWidth = isOverlay
    ? hasSidebarTextLabels && isDesktop
      ? sidebarWidthExpanded
      : sidebarWidthCollapsed
    : navSheetExists
      ? `calc(${iconBarWidth} + ${sheetPanelWidth})`
      : iconBarWidth;

  // CSS custom properties for widths
  const cssVars = {
    '--icon-bar-w': iconBarWidth,
    '--sidebar-w': sidebarWidth,
    '--spacer-w': spacerWidth,
  } as CSSProperties;

  return (
    <div className="contents" style={cssVars}>
      {/* Spacer to push content - no animation on initial mount */}
      <div
        data-slot="sidebar-spacer"
        data-started={hasStarted}
        className="relative bg-transparent w-(--spacer-w) data-[started=true]:transition-[width] data-[started=true]:duration-300 data-[started=true]:ease-out group-[.focus-view]/body:hidden"
      />
      {/* Fixed sidebar */}
      <Sidebar
        id="sidebar-nav"
        collapsible="none"
        data-theme={theme}
        data-started={hasStarted}
        data-collapsed={isCollapsed}
        data-overlay={isOverlay}
        className="fixed inset-y-0 left-0 z-100 w-(--sidebar-w) transition-[width] duration-200 linear border-r-0 bg-primary group-[.focus-view]/body:hidden
          data-[theme=none]:bg-secondary data-[started=false]:-translate-x-full"
      >
        <div className="flex flex-row h-full relative">
          {/* Icon bar */}
          <div className="flex flex-col h-full w-(--icon-bar-w) transition-[width] duration-200 linear overflow-hidden">
            <SidebarContent className="gap-1">
              <SidebarGroup className="p-0">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {getBaseNavItems().map((navItem: NavItem) => (
                      <NavButton
                        key={navItem.id}
                        navItem={navItem}
                        isActive={navSheetOpen === navItem.id}
                        isCollapsed={!isExpanded}
                        onClick={triggerNavItem}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-0 gap-2">
              <Suspense>{DebugDropdown ? <DebugDropdown className="mx-2" /> : null}</Suspense>
              <SidebarMenu className="gap-1">
                <StopImpersonation isCollapsed={!isExpanded} />
                {getFooterNavItems().map((navItem: NavItem) => (
                  <NavButton
                    key={navItem.id}
                    navItem={navItem}
                    isActive={navSheetOpen === navItem.id}
                    isCollapsed={!isExpanded}
                    onClick={triggerNavItem}
                  />
                ))}
              </SidebarMenu>
            </SidebarFooter>
          </div>
        </div>
      </Sidebar>
    </div>
  );
}
