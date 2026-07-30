import { HouseIcon, MenuIcon, SearchIcon, UserIcon } from 'lucide-react';
import type { FooterLinkProps } from '~/modules/common/app/app-footer';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { AppNavLoader } from '~/modules/navigation/app-nav-loader';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { startSearchAction } from '~/modules/navigation/start-search-action';
import { UnseenNavBadge } from '~/modules/seen/unseen-nav-badge';

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons
 * on mobile. `iconSlot` replaces the default icon rendering and `badgeSlot` renders a counter over
 * the button; both are plain components, so apps can swap or drop them here.
 */
export const navItems = [
  { id: 'menu', type: 'base', icon: MenuIcon, sheet: () => <MenuSheet />, badgeSlot: UnseenNavBadge },
  { id: 'home', type: 'base', icon: HouseIcon, href: '/home', iconSlot: AppNavLoader },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  {
    id: 'account',
    type: 'base',
    icon: UserIcon,
    sheet: () => <AccountSheet />,
    mirrorOnMobile: true,
    iconSlot: AccountNavIcon,
  },
] as const;
/**
 * Set footer links
 */
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'legal', href: '/legal' },
];
