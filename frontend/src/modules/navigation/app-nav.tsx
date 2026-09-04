import { useNavigate, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useBreakpointAbove, useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { BottomBarNav } from '~/modules/navigation/bottom-bar-nav';
import { FloatingNav, type FloatingNavItem } from '~/modules/navigation/floating-nav/floating-nav';
import { navSheetClassName } from '~/modules/navigation/nav-sheet-constants';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { SidebarNav } from '~/modules/navigation/sidebar-nav';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';

export function AppNav() {
  const navigate = useNavigate();
  const isMobile = useBreakpointBelow('sm');
  const isDesktop = useBreakpointAbove('2xl');

  const updateSheet = useSheeter((state) => state.update);

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const triggerNavItem: TriggerNavItemFn = (id, ref, options) => {
    const triggerRef = ref || {
      current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
    };

    if (id === navSheetOpen) {
      setNavSheetOpen(null);
      updateSheet('nav-sheet', { open: false });
      return;
    }

    const navItem: NavItem = navItems.find((item) => item.id === id)!;

    if (navItem.action) return navItem.action(triggerRef);

    if (navItem.href) {
      if (!useNavigationStore.getState().keepNavOpen) {
        setNavSheetOpen(null);
        updateSheet('nav-sheet', { open: false });
      }
      return navigate({ to: navItem.href });
    }

    if (navItem.sheet) {
      setNavSheetOpen(navItem.id);

      const sheetSide = isMobile && navItem.mirrorOnMobile ? 'right' : 'left';
      useSheeter.getState().replace(navItem.sheet(), {
        id: 'nav-sheet',
        triggerRef,
        side: sheetSide as 'left' | 'right',
        modal: 'trap-focus',
        // Outside-press is gated by `keepNavOpen` in the sheeter's onOpenChange; disabling it here suppresses the event entirely.
        disablePointerDismissal: false,
        className: navSheetClassName,
        skipAnimation: options?.skipAnimation,
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

  const routerState = useRouterState();
  const floatingItems: FloatingNavItem[] = [];

  if (isMobile) {
    const floatingConfig = routerState.matches.reduce(
      (acc, match) => {
        const config = match.staticData.floatingNavButtons;
        if (config?.left) acc.left.push(config.left);
        if (config?.right) acc.right.push(config.right);
        return acc;
      },
      { left: [] as string[], right: [] as string[] },
    );

    for (const id of [...new Set(floatingConfig.left)]) {
      const item = navItems.find((n) => n.id === id);
      if (item)
        floatingItems.push({ id: item.id, icon: item.icon, onClick: () => triggerNavItem(item.id), direction: 'left' });
    }
    for (const id of [...new Set(floatingConfig.right)]) {
      const item = navItems.find((n) => n.id === id);
      if (item)
        floatingItems.push({
          id: item.id,
          icon: item.icon,
          onClick: () => triggerNavItem(item.id),
          direction: 'right',
        });
    }
  }

  // The owning route's path is the resetTrigger, so the floating nav resets on page change.
  const floatingNavOwner = routerState.matches.findLast((m) => m.staticData.floatingNavButtons);

  return (
    <>
      <FloatingNav items={floatingItems} resetTrigger={floatingNavOwner?.pathname} />
      {isMobile ? <BottomBarNav triggerNavItem={triggerNavItem} /> : <SidebarNav triggerNavItem={triggerNavItem} />}
    </>
  );
}
