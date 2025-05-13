import type { LinkComponentProps } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import type { RefObject } from 'react';
import type { UserMenuItem } from '~/modules/me/types';
import type { navItems } from '~/nav-config';
import type { DraggableItemData } from '~/utils/get-draggable-item-data';

export type PageDraggableItemData = DraggableItemData<UserMenuItem, 'menuItem'>;

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

export type EntityRoute = {
  to: LinkComponentProps['to'];
  params: LinkComponentProps['params'];
  search: LinkComponentProps['search'];
};
