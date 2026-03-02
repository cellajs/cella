import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { HomeIcon, MenuIcon, SearchIcon, Settings2Icon, UserIcon } from 'lucide-react';
import type { RefObject } from 'react';
import type { FooterLinkProps } from '~/modules/common/app/app-footer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { AppSearch } from '~/modules/navigation/app-search';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { PreferencesSheet } from './modules/navigation/preferences-sheet';

/**
 * Declare search nav button action
 */
function startSearchAction(triggerRef: RefObject<HTMLButtonElement | null>) {
  if (!onlineManager.isOnline()) return toaster(i18n.t('common:action.offline.text'), 'warning');

  return useDialoger.getState().create(<AppSearch />, {
    id: 'search',
    triggerRef,
    className: 'sm:max-w-2xl p-0 border-0 mb-4',
    drawerOnMobile: false,
    showCloseButton: false,
  });
}

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons on mobile
 */
export const navItems = [
  { id: 'menu', type: 'base', icon: MenuIcon, sheet: <MenuSheet /> },
  { id: 'home', type: 'base', icon: HomeIcon, href: '/home' },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  { id: 'account', type: 'base', icon: UserIcon, sheet: <AccountSheet />, mirrorOnMobile: true },
  { id: 'preferences', type: 'footer', icon: Settings2Icon, sheet: <PreferencesSheet /> },
] as const;

/**
 * Set footer links
 */
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  // { id: 'docs', href: `${appConfig.backendUrl}/docs` },
  { id: 'legal', href: '/legal' },
];
