import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import type { UserMenuItem } from '~/modules/me/types';
import { type MenuGroup, sortAndFilterMenu } from '~/modules/navigation/menu-sheet/helpers/menu-rows';

const row = (id: string, displayOrder: number, hidden: boolean, archived: boolean): UserMenuItem => ({
  id,
  name: id,
  slug: id,
  entityType: 'organization',
  tenantId: 'tenant-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: null,
  thumbnailUrl: null,
  bannerUrl: null,
  archived,
  membership: {
    id: `membership-${id}`,
    tenantId: 'tenant-1',
    channelType: 'organization',
    channelId: id,
    organizationId: id,
    userId: 'user-1',
    role: hierarchy.getLeastPrivilegedRole('organization'),
    hidden,
    muted: false,
    displayOrder,
  },
});

// Every combination of the member's hide and the channel's archive, in an order apart from the display order.
const rows = [
  row('active-second', 2, false, false),
  row('hidden-second', 4, true, false),
  row('archived-second', 9, false, true),
  row('active-first', 1, false, false),
  row('archived-and-hidden-first', 3, true, true),
  row('hidden-first', 0, true, false),
];

describe('sortAndFilterMenu', () => {
  it.each<[MenuGroup, string[]]>([
    ['active', ['active-first', 'active-second']],
    ['hidden', ['hidden-first', 'hidden-second']],
    // An archived row is archived whether its member hid it or not
    ['archived', ['archived-and-hidden-first', 'archived-second']],
  ])('lists the %s rows in display order', (group, ids) => {
    expect(sortAndFilterMenu(rows, group).map(({ id }) => id)).toEqual(ids);
  });
});
