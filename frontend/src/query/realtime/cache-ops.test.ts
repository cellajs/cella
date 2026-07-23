import type { EntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Synthetic sub-org hierarchy as a real builder instance: 'task' is a product homed at the
// `project` channel so home-list placement (deepest non-null ancestor) is exercised; base
// cella only has org-homed attachments.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .channel('organization', { parent: null, roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
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

vi.mock('~/modules/common/blocknote/yjs-editor', () => ({
  isYjsEditorActive: () => false,
  getYjsOwnedFields: () => [],
}));

vi.mock('~/query/offline', () => ({
  sourceId: 'test-source',
}));

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
vi.stubGlobal('navigator', { onLine: true });

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { fetchRangeAndPatch } = await import('./cache-ops');

// The synthetic 'task' type exists only in this file's shared mock, hence the cast.
const TASK = 'task' as EntityType;

describe('realtime cache ops', () => {
  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('removes tombstone rows returned by seq range fetch', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [
        {
          id: 'attachment-1',
          organizationId: 'org-1',
          deletedAt: '2026-06-16T20:00:00.000Z',
        },
      ],
      total: 1,
    }));

    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1' });
    queryClient.setQueryData(keys.list.home('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1' }],
      total: 1,
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '4,4', keys);

    expect(status).toBe('ok');
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toBeUndefined();
    expect(queryClient.getQueryData(keys.list.home('org-1'))).toEqual({ items: [], total: 0 });
  });

  it('inserts a brand-new row into the canonical home list and bumps total', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [{ id: 'attachment-2', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    }));

    queryClient.setQueryData(keys.list.home('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1' }],
      total: 1,
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '7,7', keys);

    expect(status).toBe('ok');
    const list = queryClient.getQueryData<{ items: { id: string }[]; total: number }>(keys.list.home('org-1'));
    expect(list?.items.map((i) => i.id)).toEqual(['attachment-2', 'attachment-1']);
    expect(list?.total).toBe(2);
  });

  it('splices a sub-org-homed row only into its own home channel list', async () => {
    const keys = createEntityKeys<Record<string, never>>(TASK);
    registerEntityQueryKeys(TASK, keys, async () => ({
      items: [{ id: 'task-1', organizationId: 'org-1', projectId: 'project-1', name: 'fresh' }],
      total: 1,
    }));

    queryClient.setQueryData(keys.list.home('org-1', 'project-1'), { items: [], total: 0 });
    queryClient.setQueryData(keys.list.home('org-1', 'project-2'), { items: [], total: 0 });
    queryClient.setQueryData(keys.list.home('org-1'), { items: [], total: 0 });

    const { status } = await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '3,3', keys);

    expect(status).toBe('ok');
    const home = queryClient.getQueryData<{ items: { id: string }[] }>(keys.list.home('org-1', 'project-1'));
    expect(home?.items.map((i) => i.id)).toEqual(['task-1']);
    // Sibling and org home lists hold rows homed elsewhere: no splice.
    expect(queryClient.getQueryData(keys.list.home('org-1', 'project-2'))).toEqual({ items: [], total: 0 });
    expect(queryClient.getQueryData(keys.list.home('org-1'))).toEqual({ items: [], total: 0 });
  });

  it('splices an org-homed row (null sub-ancestors) into the org home list only', async () => {
    const keys = createEntityKeys<Record<string, never>>(TASK);
    registerEntityQueryKeys(TASK, keys, async () => ({
      items: [{ id: 'task-2', organizationId: 'org-1', projectId: null, name: 'org level' }],
      total: 1,
    }));

    queryClient.setQueryData(keys.list.home('org-1'), { items: [], total: 0 });
    queryClient.setQueryData(keys.list.home('org-1', 'project-1'), { items: [], total: 0 });

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '4,4', keys);

    const orgHome = queryClient.getQueryData<{ items: { id: string }[] }>(keys.list.home('org-1'));
    expect(orgHome?.items.map((i) => i.id)).toEqual(['task-2']);
    expect(queryClient.getQueryData(keys.list.home('org-1', 'project-1'))).toEqual({ items: [], total: 0 });
  });

  it('does not splice into the bare org prefix key and warns that the row landed nowhere', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const keys = createEntityKeys<Record<string, never>>(TASK);
    registerEntityQueryKeys(TASK, keys, async () => ({
      items: [{ id: 'task-3', organizationId: 'org-1', projectId: 'project-1', name: 'orphan' }],
      total: 1,
    }));

    // Canonical data cached at the org PREFIX (a key-shape bug: prefixes are never data keys).
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({ items: [], total: 0 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('landed in no list cache'));
  });

  it('invalidates filtered lists for a new row instead of splicing (server-side filter unknown)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [{ id: 'attachment-2', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    }));

    const filteredKey = [...keys.list.org('org-1'), { q: '', sort: 'createdAt', order: 'desc' }];
    queryClient.setQueryData(filteredKey, { items: [{ id: 'attachment-1', organizationId: 'org-1' }], total: 1 });

    await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '7,7', keys);

    // Row is NOT inserted into the filtered list, but the list is marked stale to refetch.
    const filtered = queryClient.getQueryData<{ items: { id: string }[] }>(filteredKey);
    expect(filtered?.items.map((i) => i.id)).toEqual(['attachment-1']);
    expect(queryClient.getQueryState(filteredKey)?.isInvalidated).toBe(true);
  });

  it('updates a cached row in place without invalidating filtered lists', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'renamed' }],
      total: 1,
    }));

    const filteredKey = [...keys.list.org('org-1'), { q: '', sort: 'createdAt', order: 'desc' }];
    queryClient.setQueryData(filteredKey, {
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'old' }],
      total: 1,
    });

    await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '8,8', keys);

    const filtered = queryClient.getQueryData<{ items: { id: string; name: string }[]; total: number }>(filteredKey);
    expect(filtered?.items[0]?.name).toBe('renamed');
    expect(filtered?.total).toBe(1);
    expect(queryClient.getQueryState(filteredKey)?.isInvalidated).toBe(false);
  });

  it('reports overflow when the seq window overflows one response — no silent 1000-row delta cap', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    // A full SYNC_CHUNK_SIZE response means more changes may remain beyond this window
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: `att-${i + 1}`,
      organizationId: 'org-1',
      seq: i + 1,
    }));
    registerEntityQueryKeys('attachment', keys, async () => ({ items, total: 1500 }));

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '1', keys);

    // The caller invalidates because patching a truncated window would drop the remainder.
    expect(status).toBe('overflow');
    expect(queryClient.getQueryData(keys.detail.byId('att-1'))).toBeUndefined();
  });

  it('reports a transient error on a rejected delta fetch so callers may retry or invalidate', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => {
      throw new Error('network down');
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '5', keys);

    expect(status).toBe('error');
  });
});
