import { Home, Menu, Search, User } from 'lucide-react';

import { SheetAccount } from '~/modules/common/nav-sheet/sheet-account';
import { SheetMenu } from '~/modules/common/nav-sheet/sheet-menu';

import CreateOrganizationForm from '~/modules/organizations/create-organization-form';

import { config } from 'config';
import type { NavItem } from '~/modules/common/app-nav';
import type { SectionItem } from '~/modules/common/nav-sheet/sheet-menu';
import type { FooterLinkProps } from './modules/common/app-footer';

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
  }
];

// Here you set default footer links
export const defaultFooterLinks: FooterLinkProps[] = [
  { id: 'about', href: '/about' },
  { id: 'docs', href: `${config.backendUrl}/docs` },
  { id: 'legal', href: '/legal' },
];
