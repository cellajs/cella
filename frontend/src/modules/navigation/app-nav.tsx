import { type StaticDataRouteOption, useNavigate, useRouterState } from '@tanstack/react-router';
import i18n from 'i18next';
import { useEffect } from 'react';
import { useBreakpointAbove, useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { BottomBarNav } from '~/modules/navigation/bottom-bar-nav';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { navSheetClassName } from '~/modules/navigation/nav-sheet-constants';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { SidebarNav } from '~/modules/navigation/sidebar-nav';
import type { NavItem, NavItemId, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';

type FloatingNavConfig = { left: NavItemId[]; right: NavItemId[]; ownerPathname?: string };

/** Floating nav buttons across matches, plus the owning route's path, which resets the floating nav on page change. */
const serializeFloatingNav = (matches: { pathname: string; staticData: StaticDataRouteOption }[]) => {
  const left = new Set<NavItemId>();
  const right = new Set<NavItemId>();
  for (const { staticData } of matches) {
    if (staticData.floatingNavButtons?.left) left.add(staticData.floatingNavButtons.left);
    if (staticData.floatingNavButtons?.right) right.add(staticData.floatingNavButtons.right);
  }
  const ownerPathname = matches.findLast((m) => m.staticData.floatingNavButtons)?.pathname;
  return JSON.stringify({ left: [...left], right: [...right], ownerPathname } satisfies FloatingNavConfig);
};

export function AppNav() {
  const navigate = useNavigate();
  const isMobile = useBreakpointBelow('sm');
  const isDesktop = useBreakpointAbove('2xl');

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const triggerNavItem: TriggerNavItemFn = (id, ref) => {
    const triggerRef = ref || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };

    if (id === navSheetOpen) {
      setNavSheetOpen(null);
      useSheeter.getState().remove('nav-sheet');
      return;
    }

    const navItem: NavItem = navItems.find((item) => item.id === id)!;

    if (navItem.action) return navItem.action(triggerRef);

    if (navItem.href) {
      if (!useNavigationStore.getState().keepNavOpen) {
        setNavSheetOpen(null);
        useSheeter.getState().remove('nav-sheet');
      }
      return navigate({ to: navItem.href });
    }

    if (navItem.sheet) {
      setNavSheetOpen(navItem.id);

      const sheetSide = isMobile && navItem.mirrorOnMobile ? 'right' : 'left';
      useSheeter.getState().replace(navItem.sheet(), {
        id: 'nav-sheet',
        triggerRef,
        title: i18n.t(`c:${navItem.id}`),
        headerClassName: 'hidden',
        side: sheetSide as 'left' | 'right',
        modal: 'trap-focus',
        // Outside-press is gated by `keepNavOpen` in the sheeter's onOpenChange; disabling it here suppresses the event entirely.
        disablePointerDismissal: false,
        className: navSheetClassName,
        contentKey: navItem.id,
        autoScrollOnDrag: 'vertical',
        onClose: () => setNavSheetOpen(null),
      });
    }
  };

  useHotkeys([
    ['Shift + A', () => triggerNavItem('account')],
    ['Shift + F', () => triggerNavItem('search')],
    ['Shift + M', () => triggerNavItem('menu')],
  ]);

  // keepNavOpen is pinned only on desktop, with the preference set and a sheet open.
  useEffect(() => {
    const shouldPin = isDesktop && keepOpenPreference && !!navSheetOpen;
    if (useNavigationStore.getState().keepNavOpen !== shouldPin) {
      useNavigationStore.getState().setKeepNavOpen(shouldPin);
    }
  }, [isDesktop, keepOpenPreference, navSheetOpen]);

  // A primitive select: matches are new objects on every router write, so selecting them would re-render on each URL change.
  const floatingNavKey = useRouterState({ select: (s) => serializeFloatingNav(s.matches) });
  const floatingConfig: FloatingNavConfig = JSON.parse(floatingNavKey);
  const floatingItems: FloatingNavItem[] = [];

  if (isMobile) {
    for (const id of floatingConfig.left) {
      const item = navItems.find((n) => n.id === id);
      if (item) floatingItems.push({ id: item.id, icon: item.icon, onClick: () => triggerNavItem(item.id), direction: 'left' });
    }
    for (const id of floatingConfig.right) {
      const item = navItems.find((n) => n.id === id);
      if (item) floatingItems.push({ id: item.id, icon: item.icon, onClick: () => triggerNavItem(item.id), direction: 'right' });
    }
  }

  return (
    <>
      <FloatingNav items={floatingItems} resetTrigger={floatingConfig.ownerPathname} />
      {isMobile ? <BottomBarNav triggerNavItem={triggerNavItem} /> : <SidebarNav triggerNavItem={triggerNavItem} />}
    </>
  );
}
