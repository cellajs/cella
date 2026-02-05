import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import BottomBarNav from '~/modules/navigation/bottom-bar-nav';
import FloatingNav from '~/modules/navigation/floating-nav/floating-nav';
import SidebarNav from '~/modules/navigation/sidebar-nav';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

// Sheet class for nav sheets - positioned next to sidebar icon bar on sm+, pushes content when keepMenuOpen
export const navSheetClassName =
  'sm:left-16 sm:z-90 xs:max-w-80 sm:w-80 sm:group-[.keep-menu-open]/body:shadow-none sm:group-[.keep-menu-open]/body:border-r max-sm:shadow-[0_0_2px_5px_rgba(0,0,0,0.1)] dark:max-sm:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]';

/** Application navigation component.
 * - Renders floating, sidebar, or bottom bar nav.
 * - Manages navigation item triggering, including routing and sheet handling.
 * - Sets up hotkeys for quick navigation access.
 */
function AppNav() {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const isDesktop = useBreakpoints('min', 'xl', true);

  const updateSheet = useSheeter((state) => state.update);

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const keepOpenPreference = useNavigationStore((state) => state.keepOpenPreference);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const triggerNavItem: TriggerNavItemFn = (id, ref, options) => {
    const triggerRef = ref || {
      current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
    };

    // If nav item is already open, close it
    if (id === navSheetOpen) {
      setNavSheetOpen(null, isDesktop);
      updateSheet('nav-sheet', { open: false });
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: searched strict by existing ids
    const navItem: NavItem = navItems.find((item) => item.id === id)!;

    // If it has an action, trigger it
    if (navItem.action) return navItem.action(triggerRef);

    // If its a route, navigate to it
    if (navItem.href) {
      if (!useNavigationStore.getState().keepMenuOpen) {
        setNavSheetOpen(null, isDesktop);
        updateSheet('nav-sheet', { open: false });
      }
      return navigate({ to: navItem.href });
    }

    // If it has a sheet, use sheeter service (both mobile and desktop)
    if (navItem.sheet) {
      setNavSheetOpen(navItem.id, isDesktop);

      const sheetSide = isMobile && navItem.mirrorOnMobile ? 'right' : 'left';

      useSheeter.getState().create(navItem.sheet, {
        id: 'nav-sheet',
        triggerRef,
        side: sheetSide,
        showCloseButton: false,
        modal: isMobile,
        className: navSheetClassName,
        skipAnimation: options?.skipAnimation,
        onClose: () => setNavSheetOpen(null, isDesktop),
      });
    }
  };

  // Enable hotkeys
  useHotkeys([
    ['Shift + A', () => triggerNavItem('account')],
    ['Shift + F', () => triggerNavItem('search')],
    ['Shift + H', () => triggerNavItem('home')],
    ['Shift + M', () => triggerNavItem('menu')],
  ]);

  // Auto-open menu on mount when keepOpenPreference is enabled on desktop
  useEffect(() => {
    if (isDesktop && keepOpenPreference && !navSheetOpen) {
      triggerNavItem('menu', undefined, { skipAnimation: true });
    }
  }, []);

  return (
    <>
      <FloatingNav triggerNavItem={triggerNavItem} />
      {isMobile ? <BottomBarNav triggerNavItem={triggerNavItem} /> : <SidebarNav triggerNavItem={triggerNavItem} />}
    </>
  );
}

export default AppNav;
