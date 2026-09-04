import type { LinkComponentProps } from '@tanstack/react-router';
import type { RefObject } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import type { UserMenuItem } from '~/modules/me/types';
import type { navItems } from '~/nav-config';
import type { DraggableItemData } from '~/utils/get-draggable-item-data';

export type PageDraggableItemData = DraggableItemData<UserMenuItem, 'menuItem'>;

export type NavItemId = (typeof navItems)[number]['id'];

export type TriggerNavItemOptions = {
  skipAnimation?: boolean;
};

export type TriggerNavItemFn = (
  id: NavItemId,
  ref?: React.RefObject<HTMLButtonElement | null>,
  options?: TriggerNavItemOptions,
) => void | Promise<void>;

export type NavItem = {
  id: NavItemId;
  icon: IconComponent;
  type: 'base' | 'floating' | 'footer' | 'hidden';
  sheet?: () => React.ReactNode;
  action?: (ref: RefObject<HTMLButtonElement | null>) => void;
  href?: string;
  mirrorOnMobile?: boolean;
  /** Replaces the default `icon` rendering (e.g. avatar, loader); receives the base icon classes and the item's `icon`. */
  iconSlot?: React.ComponentType<{ className?: string; icon: IconComponent }>;
  /** Renders over the button (e.g. an unseen counter); receives position classes per bar. */
  badgeSlot?: React.ComponentType<{ isActive: boolean; className?: string }>;
};

export type EntityRoute = {
  to: LinkComponentProps['to'];
  params: LinkComponentProps['params'];
  search: LinkComponentProps['search'];
};
