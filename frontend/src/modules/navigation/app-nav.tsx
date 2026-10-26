import { type StaticDataRouteOption, useNavigate, useRouterState } from '@tanstack/react-router';
import { type RefObject, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointAbove, useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hotkeys';
import { navSheetId, sheeter, useSheeter } from '~/modules/common/sheeter/use-sheeter';
import type { UserMenuItem } from '~/modules/me/types';
import { BottomBarNav } from '~/modules/navigation/bottom-bar-nav';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { buildMenuFromCache } from '~/modules/navigation/menu-sheet/helpers/build-menu-from-cache';
import { organizationLanding } from '~/modules/navigation/menu-sheet/helpers/organization-landing';
import { navItems } from '~/modules/navigation/nav-items';
import { closeNavSheet, navSheetOptions } from '~/modules/navigation/nav-sheet';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { SidebarNav } from '~/modules/navigation/sidebar-nav';
import type { NavItem, NavItemId, TriggerNavItemFn, TriggerOrganizationFn } from '~/modules/navigation/types';
import { getCurrentUser } from '~/modules/user/user-store';
import { getRouteOrganizationId } from '~/query/realtime/sync-priority';
import { getChannelRoute } from '~/utils/channel-route';

const { navBar } = appConfig.navigation;
const { sheetPanelWidth } = appConfig.theme.navigation;

type FloatingNavConfig = { left: NavItemId[]; right: NavItemId[]; ownerPathname?: string };

/** Floating nav buttons across matches, plus the owning route's path, which resets the floating nav on page change. */
const serializeFloatingNavConfig = (matches: { pathname: string; staticData: StaticDataRouteOption }[]) => {
  const left = new Set<NavItemId>();
  const right = new Set<NavItemId>();
  for (const { staticData } of matches) {
    if (staticData.floatingNavButtons?.left) left.add(staticData.floatingNavButtons.left);
    if (staticData.floatingNavButtons?.right) right.add(staticData.floatingNavButtons.right);
  }
  const ownerPathname = matches.findLast((match) => match.staticData.floatingNavButtons)?.pathname;
  return JSON.stringify({ left: [...left], right: [...right], ownerPathname } satisfies FloatingNavConfig);
};

export function AppNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpointBelow('sm');
  const isDesktop = useBreakpointAbove('2xl');

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);
  const setKeepNavOpen = useNavigationStore((state) => state.setKeepNavOpen);
  const keepNavOpen = useNavigationStore((state) => state.keepNavOpen);
  const navSheetExists = useSheeter((state) => state.sheets.some((sheet) => sheet.id === navSheetId && sheet.open));

  useBodyClass({ 'keep-nav-open': keepNavOpen });
  useBodyClass({ 'nav-sheet-open': navSheetExists });

  const openNavSheet = (navItem: NavItem, triggerRef: RefObject<HTMLButtonElement | null>, organization?: UserMenuItem) => {
    if (!navItem.sheet) return;
    setNavSheetOpen(navItem.id, organization?.id);

    sheeter.getState().replace(navItem.sheet(), {
      ...navSheetOptions(navItem.id, triggerRef, organization),
      id: navSheetId,
      side: isMobile && navItem.mirrorOnMobile ? 'right' : 'left',
      // Outside-press is gated by `keepNavOpen` in the sheeter's onOpenChange; disabling it here suppresses the event entirely.
      disablePointerDismissal: false,
      autoScrollOnDrag: 'vertical',
    });
  };

  const triggerNavItem: TriggerNavItemFn = (id, ref) => {
    const triggerRef = ref || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };

    // On desktop the menu button turns a sheet of one organization into the full menu; on mobile it holds the switcher
    if (id === navSheetOpen && (isMobile || !navigationStore.getState().navSheetOrganizationId)) {
      closeNavSheet();
      return;
    }

    const navItem: NavItem = navItems.find((item) => item.id === id)!;

    if (navItem.action) return navItem.action(triggerRef);

    if (navItem.href) {
      if (!navigationStore.getState().keepNavOpen) closeNavSheet();
      return navigate({ to: navItem.href });
    }

    openNavSheet(navItem, triggerRef);
  };

  // A second press on the same organization closes its sheet. Coming from elsewhere, it also lands on a channel of it.
  const triggerOrganization: TriggerOrganizationFn = (organization, triggerRef) => {
    const { navSheetOpen: openItemId, navSheetOrganizationId, keepNavOpen, lastChannelIds } = navigationStore.getState();
    if (openItemId === 'menu' && navSheetOrganizationId === organization.id) return closeNavSheet();

    const menuItem: NavItem | undefined = navItems.find((item) => item.id === 'menu');
    if (!menuItem) return;
    const openSheet = () => openNavSheet(menuItem, triggerRef, organization);

    const landing =
      organization.id !== getRouteOrganizationId() &&
      organizationLanding(organization, buildMenuFromCache(getCurrentUser().id), lastChannelIds[organization.id]);
    if (!landing) return openSheet();

    const switched = navigate(getChannelRoute(landing));
    // The path change removes every sheet but a pinned open one: an unpinned sheet opens once the page has switched
    if (keepNavOpen) openSheet();
    else void switched.then(openSheet);
  };

  // Each needs Ctrl, Alt or Meta: a letter alone or with Shift is typed by speech input and fires by accident (WCAG 2.1.4).
  // Not Alt + F: Chrome on Windows opens its own menu with it.
  useHotkeys([
    ['Alt + A', () => triggerNavItem('account')],
    ['Mod + K', () => triggerNavItem('search')],
    ['Alt + M', () => triggerNavItem('menu')],
  ]);

  // Without a nav bar the menu is the navigation: beside the page on every screen above a phone, whatever the preference
  const isMenuAlwaysOpen = !navBar && !isMobile;

  useEffect(() => {
    const shouldPin = (isMenuAlwaysOpen || (isDesktop && keepOpenPreference)) && !!navSheetOpen;
    if (navigationStore.getState().keepNavOpen !== shouldPin) setKeepNavOpen(shouldPin);
  }, [isMenuAlwaysOpen, isDesktop, keepOpenPreference, navSheetOpen, setKeepNavOpen]);

  // Reopens the menu after another nav sheet closes over it
  useEffect(() => {
    if (!isMenuAlwaysOpen || navSheetOpen) return;
    const menuItem: NavItem | undefined = navItems.find((item) => item.id === 'menu');
    if (menuItem) openNavSheet(menuItem, { current: null });
  }, [isMenuAlwaysOpen, navSheetOpen]);

  // A primitive select: matches are new objects on every router write, so selecting them would re-render on each URL change.
  const floatingNavConfigJson = useRouterState({ select: (state) => serializeFloatingNavConfig(state.matches) });
  const floatingNavConfig: FloatingNavConfig = JSON.parse(floatingNavConfigJson);
  // Without a nav bar the floating menu button is the way into the navigation on every page
  if (!navBar && !floatingNavConfig.left.includes('menu')) floatingNavConfig.left.unshift('menu');
  const floatingItems: FloatingNavItem[] = [];

  if (isMobile) {
    for (const direction of ['left', 'right'] as const) {
      for (const id of floatingNavConfig[direction]) {
        const navItem = navItems.find((item) => item.id === id);
        if (navItem) floatingItems.push({ id, icon: navItem.icon, ariaLabel: t(`c:${id}`), onClick: () => triggerNavItem(id), direction });
      }
    }
  }

  return (
    <>
      <FloatingNav items={floatingItems} resetTrigger={floatingNavConfig.ownerPathname} />
      {navBar && isMobile && <BottomBarNav onNavItemClick={triggerNavItem} />}
      {navBar && !isMobile && <SidebarNav onNavItemClick={triggerNavItem} onOrganizationClick={triggerOrganization} />}
      {/* Without a nav bar the open menu takes its place: this pushes the page aside by the menu's width */}
      {isMenuAlwaysOpen && <div data-slot="sidebar-spacer" className="shrink-0 focus-view:hidden" style={{ width: sheetPanelWidth }} />}
    </>
  );
}
