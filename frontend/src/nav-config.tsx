import { Home, Menu, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';

import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { NavItem } from '~/modules/common/main-nav';
import { MainSearch, type SuggestionSection, type SuggestionType } from '~/modules/common/main-search';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';
import type { UserMenuItem } from './types/common';

// Set entities paths
export const baseEntityRoutes = {
  user: '/user/$idOrSlug',
  organization: '/$idOrSlug',
} as const;

export type NavItemId = 'menu' | 'home' | 'search' | 'account' | 'stop_impersonation';

// Here you declare your base shown main navigation items
export const baseNavItems: NavItemId[] = ['menu', 'home', 'search', 'account'];

// Here you declare all of your main navigation items
export const navItems: NavItem[] = [
  { id: 'menu', icon: Menu, sheet: <SheetMenu /> },
  { id: 'home', icon: Home, href: '/home' },
  { id: 'search', icon: Search, dialog: <MainSearch /> },
  { id: 'account', icon: User, sheet: <SheetAccount />, mirrorOnMobile: true },
];

// Here you declare the menu sections
export const menuSections: SectionItem[] = [
  {
    name: 'organizations',
    entityType: 'organization',
    createForm: <CreateOrganizationForm replaceToCreatedOrg dialog />,
    label: 'common:organizations',
  },
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

// App specific entity path resolver
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
