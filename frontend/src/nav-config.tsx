import { BellIcon, MenuIcon, SearchIcon, UserIcon } from 'lucide-react';
import type { FooterLinkProps } from '~/modules/common/app/app-footer';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { AppNavLoader } from '~/modules/navigation/app-nav-loader';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { startSearchAction } from '~/modules/navigation/start-search-action';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadNavBadge } from '~/modules/notification/unread-nav-badge';
import { UnseenNavBadge } from '~/modules/seen/unseen-nav-badge';

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons
 * on mobile. `iconSlot` replaces the default icon rendering and `badgeSlot` renders a counter over
 * the button; both are plain components, so apps can swap or drop them here.
 */
export const navItems = [
  // Home lives in the menu sheet header, so the menu button also carries the brand intro and the loading spinner.
  {
    id: 'menu',
    type: 'base',
    icon: MenuIcon,
    sheet: () => <MenuSheet />,
    iconSlot: AppNavLoader,
    badgeSlot: UnseenNavBadge,
  },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  // Mentions and addressed activity; ambient posts stay on the menu badge above.
  { id: 'notifications', type: 'base', icon: BellIcon, sheet: () => <NotificationsSheet />, badgeSlot: UnreadNavBadge },
  {
    id: 'account',
    type: 'base',
    icon: UserIcon,
    sheet: () => <AccountSheet />,
    mirrorOnMobile: true,
    iconSlot: AccountNavIcon,
  },
] as const;
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'legal', href: '/legal' },
];
