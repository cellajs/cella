import { useNavigate } from '@tanstack/react-router';
import { type RefObject, useEffect } from 'react';
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

  const { setFocusView, setNavLoading, setNavSheetOpen } = useNavigationStore.getState();
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const updateSheet = useSheeter.getState().update;

  const clickNavItem = (id: NavItemId, ref?: RefObject<HTMLButtonElement | null>) => {
    // Trigger ref is used to focus the button after closing the sheet
    const triggerRef = ref || { current: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null };

    // If nav item is already open, close it
    if (id === navSheetOpen) {
      setNavSheetOpen(null);
      updateSheet('nav-sheet', { open: false });
      return;
    }

    // Get nav item
    const navItem: NavItem = navItems.filter((item) => item.id === id)[0];

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
      hideClose: true,
      modal: isMobile,
      className:
        'fixed sm:z-105 p-0 sm:inset-0 xs:max-w-80 sm:left-16 xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:shadow-none xl:group-[.keep-menu-open]/body:group-[.keep-menu-open]/body:border-r dark:shadow-[0_0_2px_5px_rgba(255,255,255,0.05)]',
      onClose: () => {
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
      if (!pathChanged) return;

      const navState = useNavigationStore.getState();
      if (navState.focusView) setFocusView(false);

      useDialoger.getState().remove();

      // Set nav bar loading state
      setNavLoading(true);
    });
    router.subscribe('onLoad', () => setNavLoading(false));
  }, []);

  return (
    <>
      <FloatingNav onClick={clickNavItem} />
      <BarNav onClick={clickNavItem} />
    </>
  );
};

export default AppNav;
