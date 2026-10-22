import { type StaticDataRouteOption, useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpointAbove, useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { navSheetId, sheeter } from '~/modules/common/sheeter/use-sheeter';
import { BottomBarNav } from '~/modules/navigation/bottom-bar-nav';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { navItems } from '~/modules/navigation/nav-items';
import { closeNavSheet, navSheetOptions } from '~/modules/navigation/nav-sheet';
import { navigationStore, useNavigationStore } from '~/modules/navigation/navigation-store';
import { SidebarNav } from '~/modules/navigation/sidebar-nav';
import type { NavItem, NavItemId, TriggerNavItemFn } from '~/modules/navigation/types';

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

  const triggerNavItem: TriggerNavItemFn = (id, ref) => {
    const triggerRef = ref || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };

    if (id === navSheetOpen) {
      closeNavSheet();
      return;
    }

    const navItem: NavItem = navItems.find((item) => item.id === id)!;

    if (navItem.action) return navItem.action(triggerRef);

    if (navItem.href) {
      if (!navigationStore.getState().keepNavOpen) closeNavSheet();
      return navigate({ to: navItem.href });
    }

    if (navItem.sheet) {
      setNavSheetOpen(navItem.id);

      sheeter.getState().replace(navItem.sheet(), {
        ...navSheetOptions(navItem.id, triggerRef),
        id: navSheetId,
        side: isMobile && navItem.mirrorOnMobile ? 'right' : 'left',
        // Outside-press is gated by `keepNavOpen` in the sheeter's onOpenChange; disabling it here suppresses the event entirely.
        disablePointerDismissal: false,
        autoScrollOnDrag: 'vertical',
      });
    }
  };

  // Each needs Ctrl, Alt or Meta: a letter alone or with Shift is typed by speech input and fires by accident (WCAG 2.1.4).
  // Not Alt + F: Chrome on Windows opens its own menu with it.
  useHotkeys([
    ['Alt + A', () => triggerNavItem('account')],
    ['Mod + K', () => triggerNavItem('search')],
    ['Alt + M', () => triggerNavItem('menu')],
  ]);

  useEffect(() => {
    const shouldPin = isDesktop && keepOpenPreference && !!navSheetOpen;
    if (navigationStore.getState().keepNavOpen !== shouldPin) setKeepNavOpen(shouldPin);
  }, [isDesktop, keepOpenPreference, navSheetOpen, setKeepNavOpen]);

  // A primitive select: matches are new objects on every router write, so selecting them would re-render on each URL change.
  const floatingNavConfigJson = useRouterState({ select: (state) => serializeFloatingNavConfig(state.matches) });
  const floatingNavConfig: FloatingNavConfig = JSON.parse(floatingNavConfigJson);
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
      {isMobile ? <BottomBarNav onNavItemClick={triggerNavItem} /> : <SidebarNav onNavItemClick={triggerNavItem} />}
    </>
  );
}
