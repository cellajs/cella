import type { UserMenuItem } from '~/modules/users/types';
import type { DraggableItemData } from '~/utils/drag-drop';

export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };
