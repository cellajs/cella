import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Bell, Home, LucideProps, Menu, Search, User } from 'lucide-react';
import React, { Fragment } from 'react';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { AvatarWrap } from './avatar-wrap';

import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dialog } from '~/modules/common/dialoger/state';
import { Input } from '~/modules/ui/input';
import { useNavigationStore } from '~/store/navigation';
import { SheetAccount } from './app-sheet/sheet-account';
import { SheetMenu } from './app-sheet/sheet-menu';
import { SheetNotifications } from './app-sheet/sheet-notifications';
import { cn } from '~/lib/utils';

export type NavItem = {
  id: string;
  name: string;
  icon: React.ElementType<LucideProps>;
  sheet?: React.ReactNode;
  href?: string;
  mirrorOnMobile?: boolean;
};

export const navItems: NavItem[] = [
  { id: 'menu', name: 'Menu', sheet: <SheetMenu />, icon: Menu },
  { id: 'home', name: 'Home', icon: Home, href: '/' },
  { id: 'notifications', name: 'Notifications', sheet: <SheetNotifications />, icon: Bell, mirrorOnMobile: true },
  { id: 'search', name: 'Search', icon: Search },
  { id: 'account', name: 'Account', sheet: <SheetAccount />, icon: User, mirrorOnMobile: true },
];

const AppNav = () => {
  const navigate = useNavigate();
  const isSmallScreen = useBreakpoints('max', 'lg');
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore(({ activeSheet, setSheet, keepMenuOpen }) => ({ activeSheet, setSheet, keepMenuOpen }));
  const { theme } = useThemeStore();

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';

  const navButtonClick = (navItem: NavItem) => {
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      dialog(<Input placeholder={'Search ...'} />, {
        className: 'sm:max-w-2xl -mt-[calc(70vh-140px)]',
        title: 'Search',
        description: 'Search through organizations & users within CellaJS.',
        drawerOnMobile: false,
      });
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
    <nav className={cn("fixed z-40 w-full overflow-y-auto md:fixed md:left-0 md:top-0 md:h-svh md:w-16", navBackground)}>
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
  );
};

export default AppNav;

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (id: string) => void;
}

// Create a nav button component
const NavButton = ({ navItem, isActive, onClick }: NavButtonProps) => {
  const user = useUserStore((state) => state.user);
  const { theme } = useThemeStore();

  const navIconColor = theme !== 'none' ? 'text-primary-foreground' : '';
  const activeClass = isActive ? 'bg-accent/20 hover:bg-accent/20' : '';

  return (
    <Button
      variant="ghost"
      className={cn('hover:bg-accent/10 transition-transform h-14 w-14', navIconColor, activeClass)}
      onClick={() => onClick(navItem.id)}
    >
      {navItem.id === 'account' ? (
        <AvatarWrap
          type="user"
          className="border-[1.5px] border-current text-primary-foreground"
          id={user.id}
          name={user.name}
          url={user.thumbnailUrl}
        />
      ) : (
        <navItem.icon strokeWidth={config.theme.strokeWidth} />
      )}
    </Button>
  );
};
