import { Home, Menu, Plus, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import CreateWorkspaceForm from '~/modules/workspaces/create-workspace-form';

import { Suspense, lazy } from 'react';
import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { NavItem } from '~/modules/common/main-nav';
import { MainSearch, type SuggestionSection, type SuggestionType } from '~/modules/common/main-search';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';
import type { UserMenuItem } from './types/common';

const CreateTaskForm = lazy(() => import('~/modules/tasks/create-task-form'));

// Set entities paths
export const baseEntityRoutes = {
  user: '/user/$idOrSlug',
  userInOrg: '/$orgIdOrSlug/user/$idOrSlug',
  organization: '/$idOrSlug',
  workspace: '/$orgIdOrSlug/workspaces/$idOrSlug',
  project: '/$orgIdOrSlug/workspaces/$idOrSlug/board',
} as const;

export type NavItemId = 'menu' | 'home' | 'search' | 'account' | 'workspace-menu' | 'workspace-add-task' | 'stop_impersonation';

// Here you declare your base shown main navigation items
export const baseNavItems: NavItemId[] = ['menu', 'home', 'search', 'account'];

// Here you declare all of your main navigation items
export const navItems: NavItem[] = [
  { id: 'menu', icon: Menu, sheet: <SheetMenu /> },
  { id: 'home', icon: Home, href: '/home' },
  { id: 'search', icon: Search, dialog: <MainSearch /> },
  { id: 'account', icon: User, sheet: <SheetAccount />, mirrorOnMobile: true },
  {
    id: 'workspace-add-task',
    icon: Plus,
    dialog: (
      <Suspense>
        <CreateTaskForm projectIdOrSlug={''} dialog />
      </Suspense>
    ),
  },
];

// Here you declare the menu sections
export const menuSections: SectionItem[] = [
  {
    name: 'organizations',
    entityType: 'organization',
    createForm: <CreateOrganizationForm dialog />,
    label: 'common:organizations',
  },
  {
    name: 'workspaces',
    entityType: 'workspace',
    createForm: <CreateWorkspaceForm dialog />,
    label: 'app:workspaces',
    submenu: {
      name: 'workspaces',
      entityType: 'project',
      label: 'app:projects',
    },
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

// App specific entity path resolver
// TODO review this again, I dont like the fallback to empty string
export const getEntityPath = (item: UserMenuItem | SuggestionType) => {
  const basePath = baseEntityRoutes[item.entity];
  // TODO: use entityField util here? so it becomes projectId which is more consistent?
  const queryParams = item.membership?.workspaceId && item.entity === 'project' ? `?${item.entity}=${item.slug}` : '';

  const idOrSlug = item.membership?.workspaceId && item.entity === 'project' ? item.membership.workspaceId : item.slug;
  const orgIdOrSlug = item.organizationId || '';

  const path = `${basePath}${queryParams}`;

  return { path, idOrSlug, orgIdOrSlug };
};
