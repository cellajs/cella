import type { LinkComponentProps } from '@tanstack/react-router';
import type { ComponentType, ReactNode, RefObject } from 'react';
import type { ChannelEntityType } from 'shared';
import type { IconComponent } from '~/modules/common/icons/types';
import type { UserMenuItem } from '~/modules/me/types';
import type { navItems } from '~/modules/navigation/nav-items';
import type { DraggableItemData } from '~/utils/get-draggable-item-data';

export type MenuItemDragData = DraggableItemData<UserMenuItem, 'menuItem'>;

export type NavItemId = (typeof navItems)[number]['id'];

/** A result opened from AppSearch, by reference: the query cache holds the entity. */
export type RecentSelection = { entityType: ChannelEntityType | 'user'; id: string };

export type TriggerNavItemFn = (id: NavItemId, ref?: RefObject<HTMLButtonElement | null>) => void | Promise<void>;

/** What a nav item's `badge` receives: `isActive` while the item's sheet is open, and position classes per bar. */
export interface NavBadgeProps {
  isActive: boolean;
  className?: string;
}

export type NavItem = {
  id: NavItemId;
  icon: IconComponent;
  type: 'base' | 'floating' | 'footer' | 'hidden';
  sheet?: () => ReactNode;
  action?: (ref: RefObject<HTMLButtonElement | null>) => void;
  href?: string;
  mirrorOnMobile?: boolean;
  /** Replaces the default `icon` rendering (e.g. avatar, loader); receives the base icon classes and the item's `icon`. */
  iconOverride?: ComponentType<{ className?: string; icon: IconComponent }>;
  /** Renders over the button (e.g. an unseen counter). */
  badge?: ComponentType<NavBadgeProps>;
};

export type EntityRoute = { to: LinkComponentProps['to']; params: LinkComponentProps['params']; search: LinkComponentProps['search'] };

/** Opens the menu sheet with one organization alone, the way a rail button per organization does. */
export type TriggerOrganizationFn = (organization: UserMenuItem, triggerRef: RefObject<HTMLButtonElement | null>) => void;
