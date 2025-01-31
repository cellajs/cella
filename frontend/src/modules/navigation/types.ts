import type { InferResponseType } from 'hono';
import type { meClient } from '~/modules/users/api';
import type { DraggableItemData } from '~/utils/drag-drop';

export type UserMenu = Extract<InferResponseType<(typeof meClient.menu)['$get']>, { data: unknown }>['data'];
export type UserMenuItem = UserMenu[keyof UserMenu][number];

export type PageDraggableItemData = DraggableItemData<UserMenuItem> & { type: 'menuItem' };
