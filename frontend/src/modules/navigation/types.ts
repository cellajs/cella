import type { UserMenuItem } from '~/modules/me/types';
import type { DraggableItemData } from '~/utils/get-draggable-item-data';

export type PageDraggableItemData = DraggableItemData<UserMenuItem, 'menuItem'>;
