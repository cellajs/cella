import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import router from '~/lib/router';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import BarNav from '~/modules/navigation/bar-nav';
import FloatingNav from '~/modules/navigation/floating-nav';
import { type NavItem, type NavItemId, navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

const AppNav = () => {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const { setFocusView, setLoading, setNavSheetOpen } = useNavigationStore.getState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const updateSheet = useSheeter.getState().update;

  const clickNavItem = (id: NavItemId) => {
    // If nav item is already open, close it
    if (id === navSheetOpen) {
      setNavSheetOpen(null);
      updateSheet('nav-sheet', { open: false });
      return;
    }

    // Get nav item
    const navItem: NavItem = navItems.filter((item) => item.id === id)[0];

    // If it has an action, trigger it
    if (navItem.action) return navItem.action();

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
      side: sheetSide,
      hideClose: true,
      modal: isMobile,
      className:
        'fixed sm:z-105 p-0 sm:inset-0 xs:max-w-80 sm:left-16 xl:group-[.keep-menu-open]/body:group-[.menu-sheet-open]/body:shadow-none xl:group-[.keep-menu-open]/body:group-[.menu-sheet-open]/body:border-r dark:shadow-[0_0_30px_rgba(255,255,255,0.05)]',
      removeCallback: () => {
        setNavSheetOpen(null);
      },
    });
  };

  // Enable hotkeys
  useHotkeys([
    ['Shift + A', () => clickNavItem('account')],
    ['Shift + F', () => clickNavItem('search')],
    ['Shift + H', () => clickNavItem('home')],
    ['Shift + M', () => clickNavItem('menu')],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged }) => {
      const navState = useNavigationStore.getState();
      const sheetOpen = navState.navSheetOpen;

      if (!pathChanged) return;

      if (navState.focusView) setFocusView(false);

      // TODO - shouldnt be here - Clear sheets and dialogs
      if (sheetOpen && (sheetOpen !== 'menu' || !navState.keepMenuOpen)) {
        setNavSheetOpen(null);
        useSheeter.getState().remove();
      } else useSheeter.getState().remove(undefined, 'nav-sheet');

      useDialoger.getState().remove();

      // Set nav bar loading state
      setLoading(true);
    });
    router.subscribe('onLoad', () => {
      setLoading(false);
    });
  }, []);

  return (
    <>
      <FloatingNav onClick={clickNavItem} />
      <BarNav onClick={clickNavItem} />
    </>
  );
};

export default AppNav;
