import { HomeIcon, MenuIcon, SearchIcon, UserIcon } from 'lucide-react';
import type { FooterLinkProps } from '~/modules/common/app/app-footer';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { startSearchAction } from '~/modules/navigation/start-search-action';

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons on mobile
 */
export const navItems = [
  { id: 'menu', type: 'base', icon: MenuIcon, sheet: <MenuSheet /> },
  { id: 'home', type: 'base', icon: HomeIcon, href: '/home' },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  { id: 'account', type: 'base', icon: UserIcon, sheet: <AccountSheet />, mirrorOnMobile: true },
] as const;
/**
 * Set footer links
 */
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'legal', href: '/legal' },
];
