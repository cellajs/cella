import { Home, Menu, Search, User } from 'lucide-react';
import type { RefObject } from 'react';

import { AccountSheet } from '~/modules/navigation/account-sheet';
import { MenuSheet } from '~/modules/navigation/menu-sheet';

import { onlineManager } from '@tanstack/react-query';
import i18n from 'i18next';
import type { FooterLinkProps } from '~/modules/common/app-footer';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster';
import type { UserMenuItem } from '~/modules/me/types';
import { AppSearch, type EntityListItemType, type EntitySearchSection } from '~/modules/navigation/search';
import type { EntityRoute } from '~/modules/navigation/types';
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
 * Set page entity search sections
 */
export const entitySearchSections: EntitySearchSection[] = [
  { id: 'users', label: 'common:users', type: 'user' },
  { id: 'organizations', label: 'common:organizations', type: 'organization' },
];

/**
 * App-specific entity path resolver
 *
 * Since each app has its own entity structure or hierarchy, we need to resolve them dynamically in some cases.
 * For example to get/search entities and for items in the menu sheet.
 */
export const getEntityRoute = (item: UserMenuItem | EntityListItemType): EntityRoute => {
  const { entityType, id, slug } = item;

  const to = baseEntityRoutes[entityType].to;
  const params = { idOrSlug: slug || id };

  return { to, params, search: {} };
};
