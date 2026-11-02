import { isChannelArchivable } from 'shared';
import type { UserMenuItem } from '~/modules/me/types';

/** A row moves when it has a sibling to pass or the Archived row to cross. */
export const canMove = (item: UserMenuItem, siblings: UserMenuItem[]) => siblings.length > 1 || isChannelArchivable(item.entityType);
