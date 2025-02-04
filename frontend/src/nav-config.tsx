import { Home, Menu, Search, User } from 'lucide-react';

import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';

import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { NavItem } from '~/modules/navigation';
import { AppSearch, type SuggestionSection, type SuggestionType } from '~/modules/navigation/search';
import type { UserMenuItem } from '~/modules/users/types';

// Set entity paths so we can dynamically use them in the app
export const baseEntityRoutes = {
  user: '/users/$idOrSlug',
  organization: '/$idOrSlug',
} as const;

export type NavItemId = 'menu' | 'home' | 'search' | 'account' | 'stop_impersonation';

// Here you declare your base shown main navigation items
export const baseNavItems: NavItemId[] = ['menu', 'home', 'search', 'account'];

// Here you declare all of your main navigation items
export const navItems: NavItem[] = [
  { id: 'menu', icon: Menu, sheet: <MenuSheet /> },
  { id: 'home', icon: Home, href: '/home' },
  { id: 'search', icon: Search, dialog: <AppSearch /> },
  { id: 'account', icon: User, sheet: <AccountSheet />, mirrorOnMobile: true },
];

// Here you set default footer links
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  // { id: 'docs', href: `${config.backendUrl}/docs` },
  { id: 'legal', href: '/legal' },
];

// Set search suggestion sections
export const suggestionSections: SuggestionSection[] = [
  { id: 'users', label: 'common:users', type: 'user' },
  { id: 'organizations', label: 'common:organizations', type: 'organization' },
];

// App-specific entity path resolver
export const getEntityRoute = (item: UserMenuItem | SuggestionType) => {
  const {
    entity,
    id,
    slug,
    membership: { organizationId },
  } = item;

  const path = baseEntityRoutes[entity];

  const idOrSlug = slug || id;
  const orgIdOrSlug = entity === 'organization' ? id : organizationId;

  return { path, params: { idOrSlug, orgIdOrSlug } };
};
