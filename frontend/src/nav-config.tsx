import { Home, Menu, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import CreateWorkspaceForm from '~/modules/workspaces/create-workspace-form';

import type { NavItem } from '~/modules/common/app-nav';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';

// Here you declare main navigation items
export const navItems: NavItem[] = [
  { id: 'menu', sheet: <SheetMenu />, icon: Menu },
  { id: 'home', icon: Home, href: '/' },
  { id: 'search', icon: Search },
  { id: 'account', sheet: <SheetAccount />, icon: User, mirrorOnMobile: true },
];

// Here you declare the menu sections
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
