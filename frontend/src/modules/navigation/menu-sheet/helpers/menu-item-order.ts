import { getRelativeOrder } from 'shared/utils/display-order';
import type { UserMenuItem } from '~/modules/me/types';

/** The display order `item` takes placed at `edge` of `target`, among the siblings its list orders it in. */
export const menuItemOrder = (siblings: UserMenuItem[], item: UserMenuItem, target: UserMenuItem, edge: 'top' | 'bottom') =>
  getRelativeOrder(
    siblings.map((sibling) => ({ id: sibling.id, displayOrder: sibling.membership.displayOrder })),
    target.membership.displayOrder,
    item.id,
    edge,
  );
