import { BellIcon, MenuIcon, SearchIcon, UserIcon } from 'lucide-react';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { AppIcon, AppNavLoader } from '~/modules/navigation/app-nav-loader';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { startSearchAction } from '~/modules/navigation/start-search-action';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadNavBadge } from '~/modules/notification/unread-nav-badge';
import { UnseenNavBadge } from '~/modules/seen/unseen-nav-badge';

/** The main navigation items, in the nav bars and as floating buttons on mobile. */
export const navItems = [
  // Leads only a nav bar of organization buttons; elsewhere the menu header links home. Whichever leads carries the brand intro and loader.
  { id: 'home', type: 'base', icon: AppIcon, href: '/home', iconOverride: AppNavLoader },
  { id: 'menu', type: 'base', icon: MenuIcon, sheet: () => <MenuSheet />, iconOverride: AppNavLoader, badge: UnseenNavBadge },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  // Mentions and addressed activity; ambient posts stay on the menu badge above.
  { id: 'notifications', type: 'base', icon: BellIcon, sheet: () => <NotificationsSheet />, badge: UnreadNavBadge },
  {
    id: 'account',
    type: 'base',
    icon: UserIcon,
    sheet: () => <AccountSheet />,
    mirrorOnMobile: true,
    iconOverride: AccountNavIcon,
  },
] as const;
