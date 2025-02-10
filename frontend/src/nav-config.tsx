import { Home, Menu, Search, User } from 'lucide-react';

import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';

import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { NavItem } from '~/modules/navigation';
import { AppSearch, type SuggestionSection, type SuggestionType } from '~/modules/navigation/search';
import type { UserMenuItem } from '~/modules/users/types';

/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  user: '/users/$idOrSlug',
  organization: '/$idOrSlug',
} as const;

/**
 * Declare navigation items/buttons ids for main navigation bar
 *
 * TODO confusing as the relation with navItems is not clear, type should be derived from baseNavItems? or a merge of hidden and visible items?
 */
export const baseNavItems: NavItemId[] = ['menu', 'home', 'search', 'account'];
export type NavItemId = 'menu' | 'home' | 'search' | 'account' | 'stop_impersonation';

/**
 * Declare all of your main navigation items, visible in the main navigation bar
 */
export const navItems: NavItem[] = [
  { id: 'menu', icon: Menu, sheet: <MenuSheet /> },
  { id: 'home', icon: Home, href: '/home' },
  { id: 'search', icon: Search, dialog: <AppSearch /> },
  { id: 'account', icon: User, sheet: <AccountSheet />, mirrorOnMobile: true },
];

/**
 * Set footer links
 */
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  // { id: 'docs', href: `${config.backendUrl}/docs` },
  { id: 'legal', href: '/legal' },
];

/**
 * Set search suggestion sections
 */
export const suggestionSections: SuggestionSection[] = [
  { id: 'users', label: 'common:users', type: 'user' },
  { id: 'organizations', label: 'common:organizations', type: 'organization' },
];

/**
 * App-specific entity path resolver
 *
 * Since each app has its own entity structure or hierarchy, we need to resolve them dynamically in some cases.
 * For example in search suggestions and for items in the menu sheet.
 */
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
