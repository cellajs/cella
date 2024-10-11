import { Home, Menu, Plus, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import CreateWorkspaceForm from '~/modules/workspaces/create-workspace-form';

import { Suspense, lazy } from 'react';
import type { FooterLinkProps } from '~/modules/common/main-footer';
import type { NavItem } from '~/modules/common/main-nav';
import { MainSearch, type SuggestionSection } from '~/modules/common/main-search';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';

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
