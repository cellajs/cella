import { appConfig } from 'config';
import { lazy, type RefObject, Suspense } from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import { NavButton } from '~/modules/navigation/nav-buttons';
import StopImpersonation from '~/modules/navigation/stop-impersonation';
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
import { cn } from '~/utils/cn';

const DebugToolbars =
  appConfig.mode !== 'production' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

// Cached base nav items
let baseNavItems: NavItem[] | null = null;
const getBaseNavItems = () => {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
};

interface SidebarNavProps {
  triggerNavItem: TriggerNavItemFn;
  sheetContainerRef: RefObject<HTMLDivElement | null>;
}

/**
 * Sidebar navigation: icon bar + sheet panel
 */
export function SidebarNav({ triggerNavItem, sheetContainerRef }: SidebarNavProps) {
  const { hasStarted } = useMounted();
  const isDesktop = useBreakpoints('min', 'xl', true);

  const theme = useUIStore((state) => state.theme);
  const { navSheetOpen, keepMenuOpen } = useNavigationStore();

  useBodyClass({ 'keep-menu-open': keepMenuOpen });

  // Desktop sidebar: xl+ shows icons+text when collapsed, sheet overlays unless keepMenuOpen
  const isCollapsed = !!navSheetOpen;
  const showExpandedBar = isDesktop && !isCollapsed;
  const iconBarWidth = showExpandedBar ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)';
  const sheetPanelWidth = isCollapsed ? '20rem' : '0px';

  // Sheet overlays content unless desktop + keepMenuOpen
  const sheetOverlay = !isDesktop || !keepMenuOpen;

  // Spacer keeps content positioned (stays expanded in overlay mode)
  const spacerWidth = sheetOverlay
    ? isDesktop
      ? 'var(--sidebar-width)'
      : 'var(--sidebar-width-icon)'
    : `calc(${iconBarWidth} + ${sheetPanelWidth})`;

  const sidebarWidth = sheetOverlay ? iconBarWidth : `calc(${iconBarWidth} + ${sheetPanelWidth})`;

  return (
    <>
      {/* Spacer to push content */}
      <div
        data-slot="sidebar-spacer"
        className="relative bg-transparent transition-[width] duration-200 linear group-[.focus-view]/body:hidden"
        style={{ width: spacerWidth }}
      />
      {/* Fixed sidebar */}
      <Sidebar
        collapsible="none"
        data-theme={theme}
        data-started={hasStarted}
        data-collapsed={isCollapsed}
        className="fixed inset-y-0 left-0 z-100 transition-[width] duration-200 linear border-r-0 bg-primary data-[theme=none]:bg-secondary group-[.focus-view]/body:hidden data-[started=false]:-translate-x-full"
        style={{
          width: sidebarWidth,
        }}
      >
        <div className="flex flex-row h-full relative">
          {/* Icon bar */}
          <div
            className="flex flex-col h-full border-r border-r-background/20 transition-[width] duration-200 linear overflow-hidden"
            style={{ width: iconBarWidth }}
          >
            <SidebarContent className="gap-1">
              <SidebarGroup className="p-0">
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {getBaseNavItems().map((navItem: NavItem) => (
                      <NavButton
                        key={navItem.id}
                        navItem={navItem}
                        isActive={navSheetOpen === navItem.id}
                        isCollapsed={!showExpandedBar}
                        onClick={triggerNavItem}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter className="p-2 gap-2">
              <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
              <StopImpersonation />
            </SidebarFooter>
          </div>

          {/* Sheet panel */}
          <div
            className={cn(
              'flex flex-col bg-background h-full sm:left-16',
              sheetOverlay
                ? cn(
                    'absolute top-0 z-100 w-80 transition-[left,opacity] duration-200 linear',
                    isCollapsed ? 'left-full opacity-100' : 'left-0 opacity-0 pointer-events-none',
                  )
                : cn(
                    'overflow-hidden transition-[width,opacity] duration-200 linear',
                    isCollapsed ? 'opacity-100' : 'opacity-0',
                  ),
            )}
            style={!sheetOverlay ? { width: sheetPanelWidth } : undefined}
          >
            {/* Sheeter portal */}
            <div ref={sheetContainerRef} className="flex flex-col h-full min-w-80" />
          </div>
        </div>
      </Sidebar>
    </>
  );
}

export default SidebarNav;
