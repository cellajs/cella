import { BellIcon, MenuIcon, SearchIcon, UserIcon } from 'lucide-react';
import { AccountNavIcon } from '~/modules/navigation/account-nav-icon';
import { AccountSheet } from '~/modules/navigation/account-sheet';
import { AppIcon, AppNavLoader } from '~/modules/navigation/app-nav-loader';
import { MenuSheet } from '~/modules/navigation/menu-sheet/menu-sheet';
import { startSearchAction } from '~/modules/navigation/start-search-action';
import { NotificationsSheet } from '~/modules/notification/notifications-sheet';
import { UnreadNavBadge } from '~/modules/notification/unread-nav-badge';
import { UnseenNavBadge } from '~/modules/seen/unseen-nav-badge';

/** The main navigation items, in the nav bars and as floating buttons on mobile; an app with its own set pins this file in `cella/cella.config.ts`. */
export const navItems = [
  // The app icon leads every nav bar and goes home; it also carries the brand intro and the loading spinner.
  { id: 'home', type: 'base', icon: AppIcon, href: '/home', iconSlot: AppNavLoader },
  { id: 'menu', type: 'base', icon: MenuIcon, sheet: () => <MenuSheet />, badgeSlot: UnseenNavBadge },
  { id: 'search', type: 'base', icon: SearchIcon, action: startSearchAction },
  // Mentions and addressed activity; ambient posts stay on the menu badge above.
  { id: 'notifications', type: 'base', icon: BellIcon, sheet: () => <NotificationsSheet />, badgeSlot: UnreadNavBadge },
  {
    id: 'account',
    type: 'footer',
    icon: UserIcon,
    sheet: () => <AccountSheet />,
    mirrorOnMobile: true,
    iconSlot: AccountNavIcon,
  },
] as const;
