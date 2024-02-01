import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Bell, Home, LucideProps, Menu, Search, User } from 'lucide-react';
import React, { Fragment } from 'react';
import { Button } from '~/components/ui/button';
import { useThemeStore } from '~/store/theme';
import { useUserStore } from '~/store/user';
import { AvatarWrap } from './avatar-wrap';

import { dialog } from '~/components/dialoger/state';
import { Input } from '~/components/ui/input';
import { useMediaQuery } from '~/hooks/useMediaQuery';
import { useNavigationStore } from '~/store/navigation';
import { SheetAccount } from './app-sheet/sheet-account';
import { SheetMenu } from './app-sheet/sheet-menu';
import { SheetNotifications } from './app-sheet/sheet-notifications';

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

interface NavButtonProps {
  navItem: NavItem;
  isActive: boolean;
  onClick: (id: string) => void;
}

const AppNav = () => {
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 1024px)');
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore();
  const { theme } = useThemeStore();

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';
  const navIconColor = theme !== 'none' ? 'text-primary-foreground' : '';

  const NavButton = ({ navItem, isActive, onClick }: NavButtonProps) => {
    const activeClass = isActive ? 'bg-accent/20 hover:bg-accent/20' : '';
    const isAccountItem = navItem.id === 'account';

    return (
      <Button
        variant="ghost"
        className={`hover:bg-accent/10 transition-transform h-14 w-14 ${navIconColor} ${activeClass}`}
        onClick={() => onClick(navItem.id)}
      >
        {isAccountItem && (
          <AvatarWrap
            type="user"
            className="border-[1.5px] border-current text-primary-foreground"
            id={user.id}
            name={user.name}
            url={user.thumbnailUrl}
          />
        )}
        {!isAccountItem && <navItem.icon strokeWidth={config.theme.strokeWidth} />}
      </Button>
    );
  };

  const handleButtonClick = (navItem: NavItem) => {
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
      if (!keepMenuOpen || isMobile || activeSheet?.id !== 'menu') setSheet(null);
      navigate({ to: navItem.href });
    } else {
      const isNew = !activeSheet || activeSheet.id !== navItem.id;
      setSheet(isNew ? navItem : null);
    }
  };

  return (
    <nav className={`${navBackground} fixed z-40 w-full overflow-y-auto md:fixed md:left-0 md:top-0 md:h-svh md:w-16`}>
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
              <li className={`md:grow-0 ${listItemClass}`} key={navItem.id}>
                <NavButton navItem={navItem} isActive={isActive} onClick={() => handleButtonClick(navItem)} />
              </li>
            </Fragment>
          );
        })}
      </ul>
    </nav>
  );
};

export { AppNav };
