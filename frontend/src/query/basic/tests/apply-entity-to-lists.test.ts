import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EntityQueryKeys } from '~/query/basic/entity-query-registry';
import type { ItemData, OrgRoutableItemData } from '~/query/basic/types';

// Base cella has only org-homed attachments; a real builder instance with an org-only topology
// keeps home resolution (deepest non-null ancestor, org for org-homed rows) deterministic here.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .channel('organization', { parent: null, roles: roles.all })
    .product('attachment', { parent: 'organization' })
    .build();
  return {
    ...actual,
    appConfig: {
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});
vi.mock('~/query/offline', () => ({ sourceId: 'test-source' }));
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

// The change* helpers write through the module-singleton queryClient, so tests use that instance.
const { queryClient } = await import('~/query/query-client');
const { insertEntitiesIntoHome, spliceEntityIntoListCaches } = await import('~/query/basic/apply-entity-to-lists');

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

  it('inserts a new row into the canonical home list ONLY, never the filtered/search list', () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });
    queryClient.setQueryData(filteredKey, { pages: [{ items: [], total: 0 }], pageParams: [{ page: 0 }] });

    const result = spliceEntityIntoListCaches(queryClient, row('a'));

    const home = queryClient.getQueryData<{ items: ItemData[]; total: number }>(homeKey);
    const filtered = queryClient.getQueryData<{ pages: { items: ItemData[]; total: number }[] }>(filteredKey);

    expect(home?.items.map((i) => i.id)).toEqual(['a']);
    expect(home?.total).toBe(1);
    // The search list did not gain the non-matching row.
    expect(filtered?.pages[0].items).toEqual([]);
    expect(filtered?.pages[0].total).toBe(0);
    expect(result).toMatchObject({ seen: false, spliced: true, sawFilteredList: true });
  });

  it('updates an existing row in place across home and filtered lists without inserting', () => {
    queryClient.setQueryData(homeKey, { items: [row('a', { name: 'old' })], total: 1 });
    queryClient.setQueryData(filteredKey, {
      pages: [{ items: [row('a', { name: 'old' })], total: 1 }],
      pageParams: [{ page: 0 }],
    });

    const result = spliceEntityIntoListCaches(queryClient, row('a', { name: 'new' }));

    const home = queryClient.getQueryData<{ items: ItemData[]; total: number }>(homeKey);
    const filtered = queryClient.getQueryData<{ pages: { items: ItemData[]; total: number }[] }>(filteredKey);

    expect(home?.items[0]).toMatchObject({ name: 'new' });
    expect(home?.total).toBe(1);
    // Present in the filtered list, so it updates there too (no leak, no total drift).
    expect(filtered?.pages[0].items[0]).toMatchObject({ name: 'new' });
    expect(filtered?.pages[0].total).toBe(1);
    expect(result.seen).toBe(true);
  });
});

describe('insertEntitiesIntoHome: resolves the org-homed attachment home key', () => {
  afterEach(() => queryClient.clear());

  it('splices an org-homed row into [type, list, org, org]', () => {
    queryClient.setQueryData(homeKey, { items: [], total: 0 });

    insertEntitiesIntoHome(queryClient, [row('a')]);

    const home = queryClient.getQueryData<{ items: ItemData[]; total: number }>(homeKey);
    expect(home?.items.map((i) => i.id)).toEqual(['a']);
    expect(home?.total).toBe(1);
  });
});
