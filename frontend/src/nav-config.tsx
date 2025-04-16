import { Home, type LucideProps, Menu, Search, User } from 'lucide-react';
import type { RefObject } from 'react';

import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';

import { onlineManager } from '@tanstack/react-query';
import type { LinkComponentProps } from '@tanstack/react-router';
import { i18n } from '~/lib/i18n';
import type { FooterLinkProps } from '~/modules/common/app-footer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { AppSearch, type SuggestionSection, type SuggestionType } from '~/modules/navigation/search';
import { OrganizationRoute } from '~/routes/organizations';
import { UserProfileRoute } from '~/routes/users';

/**
 * Set entity paths so we can dynamically use them in the app
 */
export const baseEntityRoutes = {
  user: UserProfileRoute,
  organization: OrganizationRoute,
} as const;

/**
 * Type `base` for buttons in the main navigation bar, `floating` is for floating buttons
 */
export type NavItemId = (typeof navItems)[number]['id'];

export type NavItem = {
  id: NavItemId;
  icon: React.ElementType<LucideProps>;
  type: 'base' | 'floating';
  sheet?: React.ReactNode;
  action?: (ref: RefObject<HTMLButtonElement | null>) => void;
  href?: string;
  mirrorOnMobile?: boolean;
};

type EntityRoute = {
  to: LinkComponentProps['to'];
  params: LinkComponentProps['params'];
  search: LinkComponentProps['search'];
  activeOptions: LinkComponentProps['activeOptions'];
};
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
    hideClose: true,
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
export const getEntityRoute = (item: UserMenuItem | SuggestionType): EntityRoute => {
  const {
    entity,
    id,
    slug,
    membership: { organizationId },
  } = item;

  const idOrSlug = slug || id;
  const orgIdOrSlug = entity === 'organization' ? id : organizationId;

  const to = baseEntityRoutes[entity].to;
  const params: LinkComponentProps['params'] = { idOrSlug, orgIdOrSlug };
  const activeOptions: LinkComponentProps['activeOptions'] = { exact: false, includeHash: true, includeSearch: true };

  return { to, params, search: {}, activeOptions };
};
