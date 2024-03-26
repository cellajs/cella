import { Link, useNavigate } from '@tanstack/react-router';
import { Bell, Home, type LucideProps, Menu, Search, User } from 'lucide-react';
import type React from 'react';
import { type ChangeEvent, Fragment, useEffect, useState } from 'react';
import { useThemeStore } from '~/store/theme';

import { useTranslation } from 'react-i18next';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { cn } from '~/lib/utils';
import { dialog } from '~/modules/common/dialoger/state';
import { Input } from '~/modules/ui/input';
import { useNavigationStore } from '~/store/navigation';
import { NavSheet } from './nav-sheet';
import { SheetAccount } from './nav-sheet/sheet-account';
import { SheetMenu } from './nav-sheet/sheet-menu';
import { SheetNotifications } from './nav-sheet/sheet-notifications';

import useAppState from '~/hooks/use-app-state';
import { NavButton } from './app-nav-button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { getSuggestions, type OrganizationSuggestion, type UserSuggestion } from '~/api/general';
import { AvatarWrap } from './avatar-wrap';
import debounce from 'lodash.debounce';

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

const SearchComp = () => {
  const { t } = useTranslation();

  const [value, setValue] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<UserSuggestion[]>([]);
  const [organizationSuggestions, setOrganizationSuggestions] = useState<OrganizationSuggestion[]>([]);

  useEffect(() => {
    getSuggestions(value).then((suggestions) => {
      setUserSuggestions(suggestions.filter((suggestion) => 'email' in suggestion) as UserSuggestion[]);
      setOrganizationSuggestions(suggestions.filter((suggestion) => !('email' in suggestion)) as OrganizationSuggestion[]);
    });
  }, [value]);

  return (
    <Popover open={!!value}>
      <PopoverTrigger>
        <Input
          placeholder={t('common:placeholder.search')}
          defaultValue={value}
          onChange={debounce((event: ChangeEvent<HTMLInputElement>) => {
            setValue(event.target.value);
          }, 200)}
        />
      </PopoverTrigger>
      <PopoverContent
        className="sm:max-w-xl w-[85vw]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="flex flex-col space-y-2">
          {userSuggestions.length > 0 || organizationSuggestions.length > 0 ? (
            <>
              {userSuggestions.length > 0 && <p>{t('common:user.plural')}</p>}
              {userSuggestions.map((suggestion) => (
                <div key={suggestion.id} className="flex items-center space-x-2">
                  <Link
                    to="/user/$userIdentifier"
                    params={{ userIdentifier: suggestion.slug }}
                    className="flex space-x-2 items-center outline-0 ring-0 group"
                    onClick={() => {
                      dialog.remove();
                    }}
                  >
                    <AvatarWrap type="user" className="h-8 w-8" id={suggestion.id} name={suggestion.name} url={suggestion.thumbnailUrl} />
                    <span className="group-hover:underline underline-offset-4 truncate font-medium">{suggestion.name}</span>
                  </Link>
                </div>
              ))}
              {organizationSuggestions.length > 0 && <p>{t('common:organization.plural')}</p>}
              {organizationSuggestions.map((suggestion) => (
                <div key={suggestion.name} className="flex items-center space-x-2">
                  <Link
                    to="/$organizationIdentifier/members"
                    params={{ organizationIdentifier: suggestion.slug }}
                    className="flex space-x-2 items-center outline-0 ring-0 group"
                    onClick={() => {
                      dialog.remove();
                    }}
                  >
                    <AvatarWrap type="organization" className="h-8 w-8" id={suggestion.id} name={suggestion.name} url={suggestion.thumbnailUrl} />
                    <span className="group-hover:underline underline-offset-4 truncate font-medium">{suggestion.name}</span>
                  </Link>
                </div>
              ))}
            </>
          ) : (
            <span>{t('common:no_results_found')}</span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const AppNav = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasStarted } = useAppState();
  const isSmallScreen = useBreakpoints('max', 'lg');
  const { activeSheet, setSheet, keepMenuOpen } = useNavigationStore();
  const { theme } = useThemeStore();

  const navBackground = theme !== 'none' ? 'bg-primary' : 'bg-primary-foreground';

  const navButtonClick = (navItem: NavItem) => {
    // Search is a special case, it will open a dialog
    if (navItem.id === 'search') {
      dialog(<SearchComp />, {
        className: 'sm:max-w-2xl sm:-mt-[calc(70vh-140px)]',
        title: t('common:search'),
        text: t('common:global_search.text'),
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
    <>
      <nav
        id="app-nav"
        className={cn(
          'fixed z-40 w-full overflow-y-auto transition-transform ease-out md:fixed md:left-0 md:top-0 md:h-svh md:w-16',
          navBackground,
          !hasStarted && 'max-md:-translate-y-full md:-translate-x-full',
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
