import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import router from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { toaster } from '~/modules/common/toaster';
import BarNav from '~/modules/navigation/bar-nav';
import FloatingNav from '~/modules/navigation/floating-nav';
import { type NavItem, navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';
import { useSheeter } from '../common/sheeter/use-sheeter';

const AppNav = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const setFocusView = useNavigationStore.getState().setFocusView;
  const setLoading = useNavigationStore.getState().setLoading;
  const navSheetOpen = useNavigationStore((state) => state.navSheetOpen);
  const setNavSheetOpen = useNavigationStore.getState().setNavSheetOpen;
  const getSheet = useSheeter.getState().get;
  const updateSheet = useSheeter.getState().update;

  const clickNavItem = (id: NavItem['id']) => {
    // If the nav item is already open, close it
    if (id === navSheetOpen && getSheet('nav-sheet')?.open) {
      setNavSheetOpen(null);
      updateSheet('nav-sheet', { open: false });
      return;
    }

    // Get the nav item
    const navItem = navItems.filter((item) => item.id === id)[0];

    // If it has a dialog, open it
    if (navItem.dialog) {
      if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

      return dialog(navItem.dialog, {
        id: navItem.id,
        className: navItem.id === 'search' ? 'sm:max-w-2xl p-0 border-0 mb-4' : '',
        drawerOnMobile: navItem.id !== 'search',
        refocus: false,
        hideClose: true,
        autoFocus: !isMobile,
      });
    }

    // If its a route, navigate to it
    if (navItem.href) {
      if (!useNavigationStore.getState().keepMenuOpen) {
        setNavSheetOpen(null);
        updateSheet('nav-sheet', { open: false });
      }
      return navigate({ to: navItem.href });
    }

    // If it has an event, emit it
    if (navItem.event) {
      return dispatchEvent(new Event(navItem.event));
    }

    // Set nav sheet
    const sheetSide = isMobile ? (navItem.mirrorOnMobile ? 'right' : 'left') : 'left';

    setNavSheetOpen(navItem.id);

    // Create a sheet
    useSheeter.getState().create(navItem.sheet, {
      id: 'nav-sheet',
      side: sheetSide,
      hideClose: true,
      modal: isMobile,
      className: 'fixed sm:z-105 p-0 sm:inset-0 xs:max-w-80 sm:left-16 xl:group-[.keep-menu-open]/body:group-[.menu-sheet-open]/body:shadow-none',
      removeCallback: () => {
        setNavSheetOpen(null);
      },
    });
  };

  useHotkeys([
    ['Shift + A', () => clickNavItem('account')],
    ['Shift + F', () => clickNavItem('search')],
    ['Shift + H', () => clickNavItem('home')],
    ['Shift + M', () => clickNavItem('menu')],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged, toLocation, fromLocation }) => {
      const sheetOpen = useNavigationStore.getState().navSheetOpen;
      if (toLocation.pathname !== fromLocation?.pathname) {
        if (useNavigationStore.getState().focusView) setFocusView(false);

        // Remove all sheets in content or
        if (sheetOpen && (sheetOpen !== 'menu' || !useNavigationStore.getState().keepMenuOpen)) {
          setNavSheetOpen(null);
          useSheeter.getState().remove();
        } else useSheeter.getState().remove(undefined, 'nav-sheet');
      }
      pathChanged && setLoading(true);
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
