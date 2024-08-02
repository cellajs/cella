import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Home, type LucideProps, Menu, Search, User } from 'lucide-react';
import { Fragment, lazy, useEffect } from 'react';
import { Suspense } from 'react';
import { useThemeStore } from '~/store/theme';

import router from '~/lib/router';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { cn } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { useNavigationStore } from '~/store/navigation';
import { NavSheet } from './nav-sheet';
import { SheetAccount } from './nav-sheet/sheet-account';
import { SheetMenu } from './nav-sheet/sheet-menu';

import useMounted from '~/hooks/use-mounted';
import { NavButton } from './app-nav-button';
import { AppSearch } from './app-search';
import { useHotkeys } from '~/hooks/use-hot-keys';
import { useWorkspaceStore } from '~/store/workspace';
import { sheet } from '~/modules/common/sheeter/state';

export type NavItem = {
  id: string;
  icon: React.ElementType<LucideProps>;
  sheet?: React.ReactNode;
  href?: string;
  mirrorOnMobile?: boolean;
};

export const navItems: NavItem[] = [
  { id: 'menu', sheet: <SheetMenu />, icon: Menu },
  { id: 'home', icon: Home, href: '/' },
  { id: 'search', icon: Search },
  { id: 'account', sheet: <SheetAccount />, icon: User, mirrorOnMobile: true },
];

const DebugToolbars = config.mode === 'development' ? lazy(() => import('~/modules/common/debug-toolbars')) : () => null;

const AppNav = () => {
  const navigate = useNavigate();
  const { hasStarted } = useMounted();
  const isSmallScreen = useBreakpoints('max', 'xl');
  const { activeSheet, setSheet, setLoading, setFocusView, focusView } = useNavigationStore();

  const { focusedTaskId } = useWorkspaceStore();
  const { theme } = useThemeStore();
  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';

  const navButtonClick = (navItem: NavItem) => {
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      return dialog(<AppSearch />, {
        className: 'sm:max-w-2xl p-0 border-0',
        drawerOnMobile: false,
        refocus: false,
        hideClose: true,
        autoFocus: !isSmallScreen,
      });
    }

    // If its a route, navigate to it
    if (navItem.href) return navigate({ to: navItem.href });

    // Open new sheet
    const isNew = !activeSheet || activeSheet.id !== navItem.id;
    setSheet(isNew ? navItem : null);
  };

  useHotkeys([
    [
      'A',
      () => {
        if (focusedTaskId) return;
        navButtonClick(navItems[3]);
      },
    ],
    ['F', () => navButtonClick(navItems[2])],
    ['H', () => navButtonClick(navItems[1])],
    ['M', () => navButtonClick(navItems[0])],
  ]);

  useEffect(() => {
    router.subscribe('onBeforeLoad', ({ pathChanged, toLocation, fromLocation }) => {
      if (toLocation.pathname !== fromLocation.pathname) {
        // Disable focus view
        setFocusView(false);
        // Remove sheets in content
        sheet.remove();
        // Remove navigation sheet
        setSheet(null, 'routeChange');
      }
      pathChanged && setLoading(true);
    });
    router.subscribe('onLoad', () => {
      setLoading(false);
    });
  }, []);

  return (
    <>
      <nav
        id="app-nav"
        className={cn(
          'fixed z-[90] w-full max-sm:bottom-0 transition-transform ease-out sm:left-0 sm:top-0 sm:h-screen sm:w-16',
          navBackground,
          !hasStarted && 'max-sm:translate-y-full sm:-translate-x-full',
          focusView && 'hidden',
        )}
      >
        <ul className="flex flex-row justify-between p-1 sm:flex-col sm:space-y-1 sm:my-1">
          {navItems.map((navItem: NavItem, index: number) => {
            const isSecondItem = index === 1;
            const isActive = activeSheet?.id === navItem.id;

            const listItemClass = isSecondItem
              ? 'flex xs:absolute xs:left-1/2 sm:left-0 transform xs:-translate-x-1/2 sm:relative sm:transform-none sm:justify-start'
              : 'flex justify-start';

            return (
              <Fragment key={navItem.id}>
                {isSecondItem && <div className="hidden xs:flex xs:grow sm:hidden" />}
                <li className={cn('sm:grow-0', listItemClass)} key={navItem.id}>
                  <NavButton navItem={navItem} isActive={isActive} onClick={() => navButtonClick(navItem)} />
                </li>
              </Fragment>
            );
          })}
        </ul>
        <Suspense>{DebugToolbars ? <DebugToolbars /> : null}</Suspense>
      </nav>
      <NavSheet />
    </>
  );
};

export default AppNav;
