import type { ContextEntity } from 'config';
import type { LucideProps } from 'lucide-react';
import type { UserMenu, UserMenuItem } from '~/modules/users/types';
import type { DraggableItemData } from '~/utils/drag-drop';

export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };

export type SectionItem = {
  name: keyof UserMenu;
  entityType: ContextEntity;
  label: string;
  createForm?: React.ReactNode;
  submenu?: SectionItem;
  icon?: React.ElementType<LucideProps>;
  description?: string;
};
