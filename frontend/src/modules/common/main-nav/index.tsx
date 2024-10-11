import { useNavigate } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useHotkeys } from '~/hooks/use-hot-keys';
import router from '~/lib/router';
import { dialog } from '~/modules/common/dialoger/state';
import BarNav from '~/modules/common/main-nav/bar-nav';
import FloatNav from '~/modules/common/main-nav/float-nav';
import { sheet } from '~/modules/common/sheeter/state';
import { type NavItemId, baseNavItems, navItems } from '~/nav-config';
import { useNavigationStore } from '~/store/navigation';

export type NavItem = {
  id: NavItemId;
  icon: React.ElementType<LucideProps>;
  sheet?: React.ReactNode;
  dialog?: React.ReactNode;
  href?: string;
  mirrorOnMobile?: boolean;
};

const MainNav = () => {
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');

  const { setLoading, setFocusView, navSheetOpen, setNavSheetOpen } = useNavigationStore();

  const showedNavButtons = useMemo(() => {
    const desktop = router.state.matches.flatMap((el) => el.staticData.showedDesktopNavButtons || []);
    const mobile = router.state.matches.flatMap((el) => el.staticData.showedMobileNavButtons || []);
    return isMobile ? mobile : desktop;
  }, [router.state.matches, isMobile]);

  const renderedItems = useMemo(() => {
    const itemsIds = showedNavButtons.length ? showedNavButtons : baseNavItems;
    return navItems.filter(({ id }) => itemsIds.includes(id));
  }, [showedNavButtons]);

  const showFloatNav = renderedItems.length > 0 && renderedItems.length <= 2;

  const navButtonClick = (navItem: NavItem) => {
    // If its a have dialog, open it
    if (navItem.dialog) {
      return dialog(navItem.dialog, {
        className: navItem.id === 'search' ? 'sm:max-w-2xl p-0 border-0 mb-4' : '',
        drawerOnMobile: false,
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
    // Set nav sheet
    const sheetSide = isMobile ? (navItem.mirrorOnMobile ? 'right' : 'left') : 'left';

    setNavSheetOpen(navItem.id);

    // Create a sheet
    sheet.create(navItem.sheet, {
      id: 'nav-sheet',
      side: sheetSide,
      hideClose: true,
      modal: isMobile,
      className: `fixed sm:z-[105] p-0 sm:inset-0 xs:max-w-80 sm:left-16 ${navItem.id === 'menu' && 'group-[.keep-menu-open]/body:xl:shadow-none'}`,
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
      if (toLocation.pathname !== fromLocation.pathname) {
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

  const NavComponent = showFloatNav ? FloatNav : BarNav;
  return <NavComponent items={renderedItems} onClick={clickNavItem} />;
};

export default MainNav;
