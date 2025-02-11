import { onlineManager } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import router from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import { toaster } from '~/modules/common/toaster';
import BarNav from '~/modules/navigation/bar-nav';
import FloatingNav from '~/modules/navigation/floating-nav';
import { type NavItem, navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

const AppNav = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const { setLoading, setFocusView, navSheetOpen, setNavSheetOpen } = useNavigationStore();

  // TODO this rerenders on every route change, maybe we can instead always render both and just hide the one that is not needed
  // We might still rerender floatingNavBar on every route change, but it will be less expensive, because it is less used
  // And it wont rerender the whole appNav if properly split, just the floatingNavBar
  const renderedItems = useMemo(() => {
    const floatingButtonIdsInRoute = router.state.matches.flatMap((el) => el.staticData.floatingNavButtons || []);
    return navItems.filter(({ id, type }) => {
      if (floatingButtonIdsInRoute.length && isMobile) return floatingButtonIdsInRoute.includes(id);
      return type === 'base';
    });
  }, [router.state.matches, isMobile]);

  const showFloatingNav = renderedItems.length > 0 && renderedItems.length <= 2;

  const navButtonClick = (navItem: NavItem) => {
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
        sheet.update('nav-sheet', { open: false });
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
    sheet.create(navItem.sheet, {
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

  const clickNavItem = (index: number) => {
    // If the nav item is already open, close it
    const id = renderedItems[index].id;
    if (id === navSheetOpen && sheet.get('nav-sheet')?.open) {
      setNavSheetOpen(null);
      sheet.update('nav-sheet', { open: false });
      return;
    }

    navButtonClick(renderedItems[index]);
  };

  useHotkeys([
    ['Shift + A', () => clickNavItem(3)],
    ['Shift + F', () => clickNavItem(2)],
    ['Shift + H', () => clickNavItem(1)],
    ['Shift + M', () => clickNavItem(0)],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged, toLocation, fromLocation }) => {
      const sheetOpen = useNavigationStore.getState().navSheetOpen;
      if (toLocation.pathname !== fromLocation?.pathname) {
        if (useNavigationStore.getState().focusView) setFocusView(false);

        // Remove all sheets in content or
        if (sheetOpen && (sheetOpen !== 'menu' || !useNavigationStore.getState().keepMenuOpen)) {
          setNavSheetOpen(null);
          sheet.remove();
        } else sheet.remove(undefined, 'nav-sheet');
      }
      pathChanged && setLoading(true);
    });
    router.subscribe('onLoad', () => {
      setLoading(false);
    });
  }, []);

  const NavComponent = showFloatingNav ? FloatingNav : BarNav;
  return <NavComponent items={renderedItems} onClick={clickNavItem} />;
};

export default AppNav;
