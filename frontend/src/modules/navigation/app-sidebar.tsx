import { appConfig } from 'config';
import { lazy, type RefObject, Suspense, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import useMounted from '~/hooks/use-mounted';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import SidebarLoader from '~/modules/navigation/sidebar-loader';
import StopImpersonation from '~/modules/navigation/stop-impersonation';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '~/modules/ui/sidebar';
import { navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

const DebugToolbars =
  appConfig.mode !== 'production' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

// Base nav items for sidebar/bottom bar navigation (lazy to avoid circular dep issues)
let baseNavItems: NavItem[] | null = null;
const getBaseNavItems = () => {
  if (!baseNavItems) baseNavItems = navItems.filter(({ type }) => type === 'base');
  return baseNavItems;
};

interface AppSidebarProps {
  triggerNavItem: TriggerNavItemFn;
  sheetContainerRef: RefObject<HTMLDivElement | null>;
}

/**
 * App sidebar using shadcn sidebar-09 nested pattern.
 * - Desktop: Nested sidebars - icon bar + sheet content panel
 * - Mobile: Bottom navigation bar (sheets rendered via sheeter service as drawers)
 */
export function AppSidebar({ triggerNavItem, sheetContainerRef }: AppSidebarProps) {
  const { hasStarted } = useMounted();
  const isMobile = useBreakpoints('max', 'sm');
  const isDesktop = useBreakpoints('min', 'xl', true);

  const theme = useUIStore((state) => state.theme);
  const { navSheetOpen, keepMenuOpen } = useNavigationStore();

  // Mobile: Render bottom navigation bar
  if (isMobile) {
    return (
      <nav
        id="bar-nav"
        data-theme={theme}
        data-started={hasStarted}
        className="in-[.floating-nav]:hidden fixed z-100 flex justify-between flex-row w-full bottom-0 transition-transform ease-out shadow-xs bg-primary data-[theme=none]:bg-secondary data-[started=false]:translate-y-full group-[.focus-view]/body:hidden"
      >
        <ul className="flex flex-row justify-between p-1 w-full px-2">
          {getBaseNavItems().map((navItem: NavItem, index: number) => {
            const isSecondItem = index === 1;
            const isActive = navSheetOpen === navItem.id;

            return (
              <li
                key={navItem.id}
                className={cn(
                  'flex transform justify-start',
                  isSecondItem && 'xs:absolute xs:left-1/2 xs:-translate-x-1/2',
                )}
              >
                <MobileNavButton navItem={navItem} isActive={isActive} onClick={triggerNavItem} />
              </li>
            );
          })}
          <div className={`hidden xs:flex xs:grow`} />
        </ul>
      </nav>
    );
  }

  // Desktop: Collapsible sidebar with nested sheet content panel
  // - isDesktop (xl+): Show icons+text when no sheet, icons only when sheet open
  // - Smaller screens: Always show icons only
  // - Sheet panel overlays content unless isDesktop AND keepMenuOpen
  const isCollapsed = !!navSheetOpen;

  // Only show expanded (icons+text) on desktop-sized screens when not collapsed
  const showExpandedBar = isDesktop && !isCollapsed;
  const iconBarWidth = showExpandedBar ? 'var(--sidebar-width)' : 'var(--sidebar-width-icon)';
  const sheetPanelWidth = isCollapsed ? '20rem' : '0px';

  // Sheet overlay mode: sheet panel overlays content instead of pushing it
  // Only push content when on desktop AND keepMenuOpen is enabled
  const sheetOverlay = !isDesktop || !keepMenuOpen;

  // Spacer width: for content positioning
  // In desktop overlay mode, stay at expanded width so content doesn't shift when sheet opens
  const spacerWidth = sheetOverlay
    ? isDesktop
      ? 'calc(var(--sidebar-width) + 1px)' // Desktop overlay: stay expanded
      : 'calc(var(--sidebar-width-icon) + 1px)' // Non-desktop overlay: icons only
    : `calc(${iconBarWidth} + ${sheetPanelWidth} + 1px)`; // Non-overlay: include sheet

  // Sidebar visual width: icon bar + sheet panel when not overlaying
  const sidebarWidth = sheetOverlay
    ? `calc(${iconBarWidth} + 1px)`
    : `calc(${iconBarWidth} + ${sheetPanelWidth} + 1px)`;

  return (
    <>
      {/* Spacer div - stays in document flow to push content */}
      <div
        data-slot="sidebar-spacer"
        className="relative bg-transparent transition-[width] duration-200 linear group-[.focus-view]/body:hidden"
        style={{ width: spacerWidth }}
      />
      {/* Fixed sidebar - positioned over the spacer */}
      <Sidebar
        collapsible="none"
        data-theme={theme}
        data-started={hasStarted}
        data-collapsed={isCollapsed}
        className={cn(
          'fixed inset-y-0 left-0 z-100',
          'transition-[width] duration-200 linear',
          'border-r-0 bg-primary data-[theme=none]:bg-secondary',
          'group-[.focus-view]/body:hidden',
          'data-[started=false]:-translate-x-full',
        )}
        style={{
          width: sidebarWidth,
        }}
      >
        <div className="flex flex-row h-full relative">
          {/* Icon navigation bar - expands to show text when no sheet open */}
          <div
            className="flex flex-col h-full border-r border-r-background/20 transition-[width] duration-200 linear overflow-hidden"
            style={{ width: `calc(${iconBarWidth} + 1px)` }}
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

          {/* Sheet content panel (shows when navSheetOpen) */}
          {/* Overlay mode: slides in from behind icon bar */}
          {/* Non-overlay mode: uses width animation to push content */}
          <div
            className={cn(
              'flex flex-col bg-background h-full',
              sheetOverlay
                ? cn(
                    'absolute top-0 z-100 shadow-lg w-80 transition-[left,opacity] duration-200 linear',
                    isCollapsed ? 'left-full opacity-100' : 'left-0 opacity-0 pointer-events-none',
                  )
                : cn(
                    'overflow-hidden transition-[width,opacity] duration-200 linear',
                    isCollapsed ? 'opacity-100' : 'opacity-0',
                  ),
            )}
            style={!sheetOverlay ? { width: sheetPanelWidth } : undefined}
          >
            {/* Portal target for sheeter inline content */}
            <div ref={sheetContainerRef} className="flex flex-col h-full min-w-80" />
          </div>
        </div>
      </Sidebar>
    </>
  );
}

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  isCollapsed: boolean;
  onClick: TriggerNavItemFn;
}

/**
 * Renders the appropriate icon for a nav item
 */
function NavItemIcon({ navItem, className }: { navItem: NavItem; className?: string }) {
  const { user } = useUserStore();

  if (navItem.id === 'account' && user) {
    return (
      <AvatarWrap
        type="user"
        className={cn(
          'border-[0.1rem] size-6 -m-0.5 shrink-0 rounded-full sm:ml-0 text-base border-primary group-hover:scale-110 transition-transform',
          className,
        )}
        id={user.id}
        name={user.name}
        url={user.thumbnailUrl}
      />
    );
  }

  if (navItem.id === 'home') {
    return <SidebarLoader className={'size-5 min-w-5 min-h-5 sm:ml-0.5 shrink-0'} />;
  }

  return (
    <navItem.icon
      className={cn('group-hover:scale-110 transition-transform size-5 min-w-5 min-h-5 sm:ml-0.5 shrink-0', className)}
      strokeWidth={appConfig.theme.strokeWidth}
    />
  );
}

function NavButton({ navItem, isActive, isCollapsed, onClick }: NavButtonProps) {
  const { t } = useTranslation();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useUIStore((state) => state.theme);

  return (
    <SidebarMenuItem className="flex transform grow-0 justify-start pb-2">
      <SidebarMenuButton
        ref={buttonRef}
        size="lg"
        tooltip={{ children: t(`common:${navItem.id}`), hidden: !isCollapsed }}
        onClick={() => onClick(navItem.id, buttonRef)}
        isActive={isActive}
        data-theme={theme}
        className={cn(
          'h-12 ring-inset pl-3 focus-visible:ring-offset-0 group transition-[width] duration-200 linear',
          'data-[active=true]:bg-background/50 hover:bg-background/30',
          'text-primary-foreground data-[theme=none]:text-inherit',
          isCollapsed ? 'w-12' : 'w-full',
        )}
      >
        <NavItemIcon navItem={navItem} />
        <span
          className={cn(
            'pl-1 font-medium whitespace-nowrap transition-[opacity,width] duration-200 linear overflow-hidden',
            isCollapsed ? 'opacity-0 w-0' : 'opacity-100 w-auto',
          )}
        >
          {t(`common:${navItem.id}`)}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * Mobile navigation button - used in the bottom bar on mobile
 */
function MobileNavButton({ navItem, isActive, onClick }: Omit<NavButtonProps, 'isCollapsed'>) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const theme = useUIStore((state) => state.theme);

  return (
    <button
      ref={buttonRef}
      type="button"
      id={`${navItem.id}-nav`}
      data-theme={theme}
      data-active={isActive}
      onClick={() => onClick(navItem.id, buttonRef)}
      className={cn(
        'ring-inset focus-visible:ring-offset-0 group size-14 flex items-center justify-center rounded-md',
        'data-[active=true]:bg-background/50 hover:bg-background/30',
        'text-primary-foreground data-[theme=none]:text-inherit',
      )}
    >
      <NavItemIcon navItem={navItem} />
    </button>
  );
}

export default AppSidebar;
