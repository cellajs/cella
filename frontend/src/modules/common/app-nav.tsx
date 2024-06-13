import { useNavigate } from '@tanstack/react-router';
import { Bell, Home, type LucideProps, Menu, Search, User, Bug, BugOff } from 'lucide-react';
import type React from 'react';
import { Fragment, useEffect, useState } from 'react';
import { useThemeStore } from '~/store/theme';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { cn } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { useNavigationStore } from '~/store/navigation';
import { NavSheet } from './nav-sheet';
import { SheetAccount } from './nav-sheet/sheet-account';
import { SheetMenu } from './nav-sheet/sheet-menu';
import { SheetNotifications } from './nav-sheet/sheet-notifications';

import useMounted from '~/hooks/use-mounted';
import { NavButton } from './app-nav-button';
import { AppSearch } from './app-search';

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
  { id: 'notifications', sheet: <SheetNotifications />, icon: Bell, mirrorOnMobile: true },
  { id: 'search', icon: Search },
  { id: 'account', sheet: <SheetAccount />, icon: User, mirrorOnMobile: true },
];

const AppNav = () => {
  const navigate = useNavigate();
  const { hasStarted } = useMounted();
  const isSmallScreen = useBreakpoints('max', 'xl');
  const { activeSheet, setSheet, keepMenuOpen, focusView } = useNavigationStore();
  const { theme } = useThemeStore();
  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';
  const [navItemsToMap, setNavItemsToMap] = useState([] as NavItem[]);
  const [debugState, setDebugState] = useState(window.localStorage.debug === 'true');

  const navButtonClick = (navItem: NavItem) => {
    //Toggle debugclick
    if (navItem.id.includes('debug')) {
      window.localStorage.setItem('debug', `${!debugState}`);
      setDebugState(!debugState);
      window.dispatchEvent(new Event('storage'));
      if (!keepMenuOpen || isSmallScreen || activeSheet?.id !== 'menu') setSheet(null);
      return;
    }
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      dialog(<AppSearch />, {
        className: 'sm:max-w-2xl p-0 border-0',
        drawerOnMobile: false,
        refocus: false,
        hideClose: true,
        autoFocus: !isSmallScreen,
      });

      if (!keepMenuOpen || isSmallScreen || activeSheet?.id !== 'menu') setSheet(null);
      return;
    }

    // If its a route, navigate to it, otherwise open sheet component
    if (navItem.href) {
      if (!keepMenuOpen || isSmallScreen || activeSheet?.id !== 'menu') setSheet(null);
      navigate({ to: navItem.href });
    } else {
      const isNew = !activeSheet || activeSheet.id !== navItem.id;
      setSheet(isNew ? navItem : null);
    }
  };

  useEffect(() => {
    if (!debugState) {
      setNavItemsToMap([...navItems.slice(0, -1), { id: 'debugOn', icon: Bug }, navItems.slice(-1)[0]]);
      return;
    }
    setNavItemsToMap([...navItems.slice(0, -1), { id: 'debugOff', icon: BugOff }, navItems.slice(-1)[0]]);
  }, [debugState]);

  return (
    <>
      <nav
        id="app-nav"
        className={cn(
          'fixed z-[90] w-full max-sm:bottom-0 overflow-y-auto transition-transform ease-out sm:left-0 sm:top-0 sm:h-screen sm:w-16',
          navBackground,
          !hasStarted && 'max-sm:translate-y-full sm:-translate-x-full',
          focusView && 'hidden',
        )}
      >
        <ul className="flex flex-row justify-between p-1 sm:flex-col sm:space-y-1 sm:my-1">
          {navItemsToMap.map((navItem: NavItem, index: number) => {
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
      </nav>
      <NavSheet />
    </>
  );
};

export default AppNav;
