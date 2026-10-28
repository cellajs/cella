import '~/query/tests/query-client-env';
import type { EntityType, ProductEntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Synthetic sub-org hierarchy as a real builder instance: 'task' is a product homed at the
// `project` channel so home-list placement (deepest non-null ancestor) is exercised; base
// cella only has org-homed attachments. 'comment' is an org-homed product listed per `itemId`.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .product('comment', { parent: 'organization' })
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

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys, registerEqualityFilterKeys, syncChunkSize } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { fetchEntityAndUpdateList, fetchRangeAndPatch } = await import('~/query/realtime/cache-ops');

// The synthetic 'task' and 'comment' types exist only in this file's shared mock, hence the casts.
const TASK = 'task' as EntityType;
const comment = 'comment' as ProductEntityType;

describe('realtime cache ops', () => {
  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  it('removes tombstone rows returned by seq range fetch', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', deletedAt: '2026-06-16T20:00:00.000Z' }],
      total: 1,
    }));

    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1' });
    queryClient.setQueryData(keys.list.home('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1' }],
      total: 1,
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', { afterSeq: 3, untilSeq: 4 }, keys);

    expect(status).toBe('ok');
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toBeUndefined();
    expect(queryClient.getQueryData(keys.list.home('org-1'))).toEqual({ items: [], total: 0 });
  });

  it('a new row lands only in the list of its home channel: its deepest non-null ancestor, else the organization', async () => {
    const keys = createEntityKeys<Record<string, never>>(TASK);
    registerEntityQueryKeys(TASK, keys, async () => ({
      items: [
        { id: 'task-1', organizationId: 'org-1', projectId: 'project-1', name: 'project level' },
        { id: 'task-2', organizationId: 'org-1', projectId: null, name: 'org level' },
      ],
      total: 2,
    }));

    queryClient.setQueryData(keys.list.home('org-1', 'project-1'), { items: [], total: 0 });
    queryClient.setQueryData(keys.list.home('org-1', 'project-2'), { items: [], total: 0 });
    queryClient.setQueryData(keys.list.home('org-1'), { items: [], total: 0 });

    const { status } = await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', { afterSeq: 2, untilSeq: 4 }, keys);

    expect(status).toBe('ok');
    const ids = (key: readonly unknown[]) => queryClient.getQueryData<{ items: { id: string }[] }>(key)?.items.map((item) => item.id);
    expect(ids(keys.list.home('org-1', 'project-1'))).toEqual(['task-1']);
    expect(ids(keys.list.home('org-1'))).toEqual(['task-2']);
    // A sibling channel's list holds rows homed elsewhere: no splice.
    expect(ids(keys.list.home('org-1', 'project-2'))).toEqual([]);
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

    await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', { afterSeq: 7, untilSeq: 8 }, keys);

    const filtered = queryClient.getQueryData<{ items: { id: string; name: string }[]; total: number }>(filteredKey);
    expect(filtered?.items[0]?.name).toBe('renamed');
    expect(filtered?.total).toBe(1);
    expect(queryClient.getQueryState(filteredKey)?.isInvalidated).toBe(false);
  });

  // The caller invalidates and leaves the cursor where it was: a cut-short range, or an ordinary page from a server that
  // ignored the range (no deleted rows), would move it past rows this client never received.
  const renamed = (id: string, seq: number) => ({ id, organizationId: 'org-1', name: 'renamed', seq });
  it.each([
    [
      'overflow',
      'a full chunk, which may stop short of the range',
      { afterSeq: 0, untilSeq: 1500 },
      async () => ({
        items: Array.from({ length: syncChunkSize }, (_, i) => renamed(`attachment-${i + 1}`, i + 1)),
        total: 1500,
      }),
    ],
    ['unsupported', 'a row at afterSeq', { afterSeq: 4, untilSeq: 7 }, async () => ({ items: [renamed('attachment-1', 4)], total: 1 })],
    ['unsupported', 'a row past untilSeq', { afterSeq: 4, untilSeq: 7 }, async () => ({ items: [renamed('attachment-1', 8)], total: 1 })],
    [
      'error',
      'a rejected fetch',
      { afterSeq: 4, untilSeq: 7 },
      async () => {
        throw new Error('network down');
      },
    ],
  ] as const)('reports %s for %s and leaves the caches as they were', async (status, _case, range, rangeFetch) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    const cached = { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'old' }], total: 1 };
    queryClient.setQueryData(keys.list.home('org-1'), cached);

    const result = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', range, keys);

    expect(result.status).toBe(status);
    expect(queryClient.getQueryData(keys.list.home('org-1'))).toEqual(cached);
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toBeUndefined();
  });
});

describe('filtered list refetch for a new row', () => {
  afterEach(() => {
    queryClient.clear();
    vi.restoreAllMocks();
  });

  const commentKeys = createEntityKeys<{ itemId?: string }>(comment);
  const newComment = { id: 'comment-2', organizationId: 'org-1', itemId: 'item-1' };
  const listKey = (filters: Record<string, unknown>) => [...commentKeys.list.org('org-1'), filters];

  // Comment lists are declared to hold only rows whose itemId equals the filter's.
  function registerComments(items: { id: string; organizationId: string; itemId?: string }[] = [newComment]) {
    registerEntityQueryKeys(comment, commentKeys, async () => ({ items, total: items.length }));
    registerEqualityFilterKeys(comment, ['itemId']);
    queryClient.setQueryDefaults(commentKeys.detail.base, { queryFn: async () => newComment });
  }

  function seedLists(filtersByName: Record<string, Record<string, unknown>>) {
    for (const filters of Object.values(filtersByName)) {
      queryClient.setQueryData(listKey(filters), { items: [], total: 0 });
    }
  }

  const isInvalidated = (filters: Record<string, unknown>) => queryClient.getQueryState(listKey(filters))?.isInvalidated;

  const lists = {
    otherItem: { itemId: 'item-2' },
    otherItemSorted: { itemId: 'item-2', sort: 'createdAt', order: 'desc', limit: 20 },
    sameItem: { itemId: 'item-1' },
    otherItemSearch: { itemId: 'item-2', q: 'hello' },
    otherItemUndeclared: { itemId: 'item-2', authorId: 'user-1' },
    sameItemSearch: { itemId: 'item-1', q: 'hello' },
    sameItemUndeclared: { itemId: 'item-1', authorId: 'user-1' },
    noItem: { sort: 'createdAt' },
  };

  it('refetches on a create notification only the lists whose declared filter the row matches', async () => {
    registerComments();
    seedLists(lists);

    await fetchEntityAndUpdateList(comment, 'comment-2', commentKeys, 'create', 'org-1', 'tenant-1');

    expect(isInvalidated(lists.otherItem)).toBe(false);
    expect(isInvalidated(lists.otherItemSorted)).toBe(false);
    expect(isInvalidated(lists.sameItem)).toBe(true);
    // Filters combine with AND: another item rules the row out whatever the search or other filters say
    expect(isInvalidated(lists.otherItemSearch)).toBe(false);
    expect(isInvalidated(lists.otherItemUndeclared)).toBe(false);
    expect(isInvalidated(lists.sameItemSearch)).toBe(true);
    expect(isInvalidated(lists.sameItemUndeclared)).toBe(true);
    expect(isInvalidated(lists.noItem)).toBe(true);
  });

  it('refetches after a delta fetch only the lists that one of the new rows can belong to', async () => {
    registerComments([newComment, { id: 'comment-3', organizationId: 'org-1', itemId: 'item-3' }]);
    seedLists({ ...lists, thirdItem: { itemId: 'item-3' } });

    await fetchRangeAndPatch(comment, 'org-1', 'tenant-1', { afterSeq: 8, untilSeq: 10 }, commentKeys);

    expect(isInvalidated(lists.otherItem)).toBe(false);
    expect(isInvalidated(lists.sameItem)).toBe(true);
    expect(isInvalidated({ itemId: 'item-3' })).toBe(true);
    expect(isInvalidated(lists.otherItemSearch)).toBe(false);
    expect(isInvalidated(lists.sameItemSearch)).toBe(true);
  });

  it('refetches a filtered list it cannot rule a new row out of: the row lacks the declared field, or the type declares none', async () => {
    registerComments([{ id: 'comment-4', organizationId: 'org-1' }]);
    seedLists({ otherItem: lists.otherItem });
    await fetchRangeAndPatch(comment, 'org-1', 'tenant-1', { afterSeq: 10, untilSeq: 11 }, commentKeys);
    expect(isInvalidated(lists.otherItem)).toBe(true);

    const taskKeys = createEntityKeys<Record<string, never>>(TASK);
    registerEntityQueryKeys(TASK, taskKeys, async () => ({
      items: [{ id: 'task-9', organizationId: 'org-1', projectId: 'project-1', itemId: 'item-1' }],
      total: 1,
    }));
    const otherItemTaskKey = [...taskKeys.list.org('org-1'), { itemId: 'item-2' }];
    queryClient.setQueryData(otherItemTaskKey, { items: [], total: 0 });
    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', { afterSeq: 11, untilSeq: 12 }, taskKeys);
    expect(queryClient.getQueryState(otherItemTaskKey)?.isInvalidated).toBe(true);
  });
});
