import { Home, type LucideProps, Menu, Search, User } from 'lucide-react';

import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';

import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { UserMenuItem } from '~/modules/me/types';
import { AppSearch, type SuggestionSection, type SuggestionType } from '~/modules/navigation/search';

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
 * Type `base` if for buttons in the main navigation bar, `floating` is for floating buttons
 */
export type NavItem = {
  id: string;
  icon: React.ElementType<LucideProps>;
  type: 'base' | 'floating';
  sheet?: React.ReactNode;
  dialog?: React.ReactNode;
  href?: string;
  mirrorOnMobile?: boolean;
};

/**
 * Declare all of your main navigation items, visible in main navigation bar or as floating buttons on mobile
 */
export const navItems: NavItem[] = [
  { id: 'menu', type: 'base', icon: Menu, sheet: <MenuSheet /> },
  { id: 'home', type: 'base', icon: Home, href: '/home' },
  { id: 'search', type: 'base', icon: Search, dialog: <AppSearch /> },
  { id: 'account', type: 'base', icon: User, sheet: <AccountSheet />, mirrorOnMobile: true },
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
 * For example to get/search entities and for items in the menu sheet.
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
