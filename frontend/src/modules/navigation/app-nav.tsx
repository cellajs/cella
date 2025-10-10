import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import router from '~/lib/router';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import BarNav from '~/modules/navigation/bar-nav';
import FloatingNav from '~/modules/navigation/floating-nav';
import type { NavItem, TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

export const navSheetClassName =
  'fixed sm:w-80 sm:z-105 p-0 sm:inset-0 xs:max-w-80 sm:left-16 xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:shadow-none xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:border-r dark:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]';

const AppNav = () => {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const updateSheet = useSheeter((state) => state.update);

  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const setFocusView = useNavigationStore((state) => state.setFocusView);
  const setNavLoading = useNavigationStore((state) => state.setNavLoading);
  const setNavSheetOpen = useNavigationStore((state) => state.setNavSheetOpen);

  const triggerNavItem: TriggerNavItemFn = (id, ref) => {
    const triggerRef = ref || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };

    // If nav item is already open, close it
    if (id === navSheetOpen) {
      setNavSheetOpen(null);
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
        setNavSheetOpen(null);
        updateSheet('nav-sheet', { open: false });
      }
      return navigate({ to: navItem.href });
    }

    // If all fails, it should be a nav sheet
    const sheetSide = isMobile ? (navItem.mirrorOnMobile ? 'right' : 'left') : 'left';

    setNavSheetOpen(navItem.id);

    // Create a sheet
    useSheeter.getState().create(navItem.sheet, {
      id: 'nav-sheet',
      triggerRef,
      side: sheetSide,
      showCloseButton: false,
      modal: isMobile,
      closeSheetOnRouteChange: false,
      className: navSheetClassName,
      onClose: () => setNavSheetOpen(null),
    });
  };

  // Enable hotkeys
  useHotkeys([
    ['Shift + A', () => triggerNavItem('account')],
    ['Shift + F', () => triggerNavItem('search')],
    ['Shift + H', () => triggerNavItem('home')],
    ['Shift + M', () => triggerNavItem('menu')],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged }) => {
      if (!pathChanged) return;

      const navState = useNavigationStore.getState();
      if (navState.focusView) setFocusView(false);

      useDialoger.getState().remove();
      useSheeter.getState().removeOnRouteChange({ isCleanup: true });

      // Set nav bar loading state
      setNavLoading(true);
    });
    router.subscribe('onLoad', () => setNavLoading(false));
  }, []);

  return (
    <>
      <FloatingNav triggerNavItem={triggerNavItem} />
      <BarNav triggerNavItem={triggerNavItem} />
    </>
  );
};

export default AppNav;
