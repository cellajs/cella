import { useNavigate } from '@tanstack/react-router';
import { Bell, Home, type LucideProps, Menu, Search, User } from 'lucide-react';
import type React from 'react';
import { Fragment } from 'react';
import { useThemeStore } from '~/store/theme';

import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasStarted } = useMounted();
  const isSmallScreen = useBreakpoints('max', 'lg');
  const { activeSheet, setSheet, keepMenuOpen, focusView } = useNavigationStore();
  const { theme } = useThemeStore();

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';

  const navButtonClick = (navItem: NavItem) => {
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      dialog(<AppSearch />, {
        className: 'sm:max-w-2xl',
        title: t('common:search'),
        text: t('common:global_search.text'),
        drawerOnMobile: false,
        refocus: false,
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

  return (
    <>
      <nav
        id="app-nav"
        className={cn(
          'fixed z-[140] w-full overflow-y-auto transition-transform ease-out md:fixed md:left-0 md:top-0 md:h-svh md:w-16',
          navBackground,
          !hasStarted && 'max-md:-translate-y-full md:-translate-x-full',
          focusView && 'hidden',
        )}
      >
        <ul className="flex flex-row justify-between p-1 md:flex-col md:space-y-1">
          {navItems.map((navItem: NavItem, index: number) => {
            const isSecondItem = index === 1;
            const isActive = activeSheet?.id === navItem.id;

            const listItemClass = isSecondItem
              ? 'flex xs:absolute xs:left-1/2 md:left-0 transform xs:-translate-x-1/2 md:relative md:transform-none md:justify-start'
              : 'flex justify-start';

            return (
              <Fragment key={navItem.id}>
                {isSecondItem && <div className="hidden xs:flex xs:grow md:hidden" />}
                <li className={cn('md:grow-0', listItemClass)} key={navItem.id}>
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
