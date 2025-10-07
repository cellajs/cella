import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import { Home, Menu, Search, User } from 'lucide-react';
import type { RefObject } from 'react';
import type { FooterLinkProps } from '~/modules/common/app/footer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';
import { AppSearch } from '~/modules/navigation/search';

/**
 * Declare search nav button action
 */
const startSearchAction = (triggerRef: RefObject<HTMLButtonElement | null>) => {
  if (!onlineManager.isOnline()) return toaster(i18n.t('common:action.offline.text'), 'warning');

  return useDialoger.getState().create(<AppSearch />, {
    id: 'search',
    triggerRef,
    className: 'sm:max-w-2xl p-0 border-0 mb-4',
    drawerOnMobile: false,
    showCloseButton: false,
  });
};

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons on mobile
 */
export const navItems = [
  { id: 'menu', type: 'base', icon: Menu, sheet: <MenuSheet /> },
  { id: 'home', type: 'base', icon: Home, href: '/home' },
  { id: 'search', type: 'base', icon: Search, action: startSearchAction },
  { id: 'account', type: 'base', icon: User, sheet: <AccountSheet />, mirrorOnMobile: true },
] as const;

/**
 * Set footer links
 */
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  // { id: 'docs', href: `${appConfig.backendUrl}/docs` },
  { id: 'legal', href: '/legal' },
];
