import '~/query/tests/query-client-env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityQueryKeys } from '~/query/basic/entity-query-registry';
import type { ItemData, OrgRoutableItemData } from '~/query/basic/types';

// Base cella has only org-homed attachments; a real builder instance with an org-only hierarchy
// keeps home resolution (deepest non-null ancestor, org for org-homed rows) deterministic here.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .product('attachment', { parent: 'organization' })
    .build();
  return {
    ...actual,
    appConfig: { channelEntityTypes: hierarchy.channelTypes, entityIdColumnKeys: hierarchy.idColumnKeys },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

// changeListData writes through the module-singleton queryClient, so tests use that instance.
const { queryClient } = await import('~/query/query-client');
const { spliceEntityIntoListCaches } = await import('~/query/basic/apply-entity-to-lists');

const orgId = 'org-1';

const keys = {
  all: ['attachment'],
  list: {
    base: ['attachment', 'list'],
    org: (o: string) => ['attachment', 'list', o],
    filtered: (f: unknown) => ['attachment', 'list', f],
    home: (o: string, h?: string) => ['attachment', 'list', o, h ?? o],
  },
  detail: { base: ['attachment', 'detail'], byId: (id: string) => ['attachment', 'detail', id] },
  create: ['attachment', 'create'],
  update: ['attachment', 'update'],
  delete: ['attachment', 'delete'],
} as unknown as EntityQueryKeys;

const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
registerEntityQueryKeys('attachment', keys);

const homeKey = ['attachment', 'list', orgId, orgId];
const filteredKey = ['attachment', 'list', orgId, { q: 'foo' }];

const row = (id: string, extra: Record<string, unknown> = {}): OrgRoutableItemData => ({
  id,
  entityType: 'attachment',
  organizationId: orgId,
  ...extra,
});

describe('spliceEntityIntoListCaches: canonical-home policy', () => {
  afterEach(() => queryClient.clear());

  it('puts a new row into its canonical home list only, never a filtered list, and updates a row in every list that holds it', () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });
    queryClient.setQueryData(filteredKey, { pages: [{ items: [], total: 0 }], pageParams: [{ page: 0 }] });

    const inserted = spliceEntityIntoListCaches(queryClient, row('a'));

    const home = () => queryClient.getQueryData<{ items: ItemData[]; total: number }>(homeKey);
    const filtered = () => queryClient.getQueryData<{ pages: { items: ItemData[]; total: number }[] }>(filteredKey);
    expect(home()).toMatchObject({ items: [{ id: 'a' }], total: 1 });
    // The search list did not gain the row: its server-side filter cannot be checked here.
    expect(filtered()?.pages[0]).toEqual({ items: [], total: 0 });
    expect(inserted).toMatchObject({ seen: false, spliced: true, sawFilteredList: true });

    // Once the search list holds the row too, an update reaches both, without an insert or a total drift.
    queryClient.setQueryData(filteredKey, { pages: [{ items: [row('a', { name: 'old' })], total: 1 }], pageParams: [{ page: 0 }] });
    const updated = spliceEntityIntoListCaches(queryClient, row('a', { name: 'new' }));

    expect(home()).toMatchObject({ items: [{ id: 'a', name: 'new' }], total: 1 });
    expect(filtered()?.pages[0]).toMatchObject({ items: [{ id: 'a', name: 'new' }], total: 1 });
    expect(updated.seen).toBe(true);
  });
});
