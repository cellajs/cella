import { ArrowLeftCircle, Home, Menu, PlusCircle, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import CreateWorkspaceForm from '~/modules/workspaces/create-workspace-form';

import type { FooterLinkProps } from '~/modules/common/app-footer';
import type { NavItem } from '~/modules/common/app-nav';
import type { SuggestionSection } from '~/modules/common/app-search';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';

// Set entities paths
export const baseEntityRoutes = {
  user: '/user/$idOrSlug',
  organization: '/$idOrSlug',
  workspace: '/$orgIdOrSlug/workspaces/$idOrSlug',
  project: '/$orgIdOrSlug/workspaces/$idOrSlug/board',
} as const;

// Here you declare main navigation items
export const navItems: NavItem[] = [
  { id: 'menu', sheet: <SheetMenu />, icon: Menu, hiddenOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'], visibilityMobileOnly: true },
  { id: 'home', icon: Home, href: '/', hiddenOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'], visibilityMobileOnly: true },
  { id: 'search', icon: Search, hiddenOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'], visibilityMobileOnly: true },
  {
    id: 'account',
    sheet: <SheetAccount />,
    hiddenOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'],
    icon: User,
    mirrorOnMobile: true,
    visibilityMobileOnly: true,
  },
  { id: 'return', icon: ArrowLeftCircle, visibleOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'], visibilityMobileOnly: true },
  { id: '+task', icon: PlusCircle, visibleOn: ['/$orgIdOrSlug/workspaces/$idOrSlug/board'], visibilityMobileOnly: true },
];

// Here you declare the menu sections(same need in BE with storageType, type & isSubmenu )
export const menuSections: SectionItem[] = [
  {
    storageType: 'organizations',
    type: 'organization',
    isSubmenu: false,
    createForm: <CreateOrganizationForm dialog />,
    label: 'common:organizations',
  },
  {
    storageType: 'workspaces',
    type: 'workspace',
    isSubmenu: false,
    createForm: <CreateWorkspaceForm dialog />,
    label: 'app:workspaces',
  },
  {
    storageType: 'workspaces',
    type: 'project',
    label: 'app:projects',
    isSubmenu: true,
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
  { id: 'workspaces', label: 'app:workspaces', type: 'workspace' },
  { id: 'projects', label: 'app:projects', type: 'project' },
];
