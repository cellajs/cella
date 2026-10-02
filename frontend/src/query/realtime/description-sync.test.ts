import type { EntityType, ProductEntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Synthetic hierarchy as in cache-ops.test.ts: 'task' is a product homed at the `project` channel.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: {
      slug: 'test',
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
      seenTrackedProductTypes: [],
      productEmbeddings: [],
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

// The stream handler's outward boundaries; the Yjs-owned field registry and the cache ops stay real.
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: vi.fn() }));
vi.mock('./membership-ops', () => ({
  invalidateChannelList: vi.fn(),
  invalidateMemberQueries: vi.fn(),
  fetchMemberships: vi.fn(),
  refreshMe: vi.fn(),
}));
vi.mock('./sync-priority', () => ({
  getTenantIdForOrg: vi.fn(() => null),
  getSyncTier: vi.fn(() => ({ min: 0, max: 0 })),
  isViewingChannel: () => true,
}));

stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { sourceId } = await import('~/query/offline/stx-utils');
const { registerYjsOwnedFields } = await import('~/modules/common/blocknote/yjs-editor');
const { patchCollaborativeDescription, persistStandaloneDescription, useDescriptionUpdate } = await import(
  '~/modules/common/blocknote/use-description-update'
);
const { fetchEntityAndUpdateList, fetchRangeAndPatch } = await import('./cache-ops');
const { handleAppStreamNotification } = await import('./app-stream-handler');
const { flushAllNow, resetFetchPrioritizer } = await import('./fetch-prioritizer');

// The synthetic 'task' type exists only in this file's shared mock, hence the casts.
const TASK = 'task' as EntityType;
const TASK_PRODUCT = 'task' as ProductEntityType;

type TaskRow = {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  description: string | null;
  summary?: string;
  keywords?: string;
  updatedAt?: string;
  stx: { mutationId: string; sourceId: string; fieldTimestamps: Record<string, string> };
};

const keys = createEntityKeys<{ q?: string }>(TASK);
const detailKey = keys.detail.byId('task-1');
const homeKey = keys.list.home('org-1', 'project-1');
const filteredKey = [...keys.list.org('org-1'), { q: '' }];

const row = (description: string | null, overrides: Partial<TaskRow> = {}): TaskRow => ({
  id: 'task-1',
  organizationId: 'org-1',
  projectId: 'project-1',
  name: 'Task',
  description,
  stx: { mutationId: 'm-1', sourceId: 'other-tab', fieldTimestamps: { description: 'T1' } },
  ...overrides,
});

/** The stx of a server write with these field timestamps. */
const written = (fieldTimestamps: Record<string, string>) => ({ mutationId: 'm-2', sourceId: 'other-tab', fieldTimestamps });

const listOf = (item: TaskRow) => ({ items: [item], total: 1 });
const detail = () => queryClient.getQueryData<TaskRow>(detailKey);
const homeRow = () => queryClient.getQueryData<{ items: TaskRow[] }>(homeKey)?.items[0];
const filteredRow = () => queryClient.getQueryData<{ items: TaskRow[] }>(filteredKey)?.items[0];

/** The delta fetch answers with these rows: the seq path of a stream notification or a catchup gap. */
function serverReturns(...items: TaskRow[]) {
  registerEntityQueryKeys(TASK, keys, async () => ({ items, total: items.length }));
}

/** The detail query defaults answer with this row: the seq-less fallback path. */
function detailFetchReturns(item: TaskRow) {
  const queryFn = vi.fn(async () => item);
  queryClient.setQueryDefaults(keys.detail.base, { queryFn });
  return queryFn;
}

function seedCaches(item: TaskRow, { withDetail = true } = {}) {
  if (withDetail) queryClient.setQueryData(detailKey, item);
  queryClient.setQueryData(homeKey, listOf(item));
  queryClient.setQueryData(filteredKey, listOf(item));
}

/** A mutation for the row still in flight, as TanStack holds it until it settles. */
function buildPendingUpdate(id: string) {
  queryClient.getMutationCache().build(
    queryClient,
    { mutationKey: [TASK, 'update'], mutationFn: async () => null },
    {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
      status: 'pending',
      variables: { id },
      submittedAt: Date.now(),
    },
  );
}

afterEach(() => {
  registerYjsOwnedFields(TASK_PRODUCT, ['description']);
  resetFetchPrioritizer();
  queryClient.clear();
  vi.useRealTimers();
});

describe('server rows and the description', () => {
  it('lands the server description in the detail and in every list holding the row', async () => {
    seedCaches(row('local'));
    serverReturns(row('server', { stx: written({ description: 'T2' }) }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(detail()?.description).toBe('server');
    expect(homeRow()?.description).toBe('server');
    expect(filteredRow()?.description).toBe('server');
    expect(detail()?.stx.fieldTimestamps).toEqual({ description: 'T2' });
  });

  it('writes a detail entry for the row even when none was cached', async () => {
    seedCaches(row('local'), { withDetail: false });
    serverReturns(row('server', { stx: written({ description: 'T2' }) }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(detail()?.description).toBe('server');
    expect(homeRow()?.description).toBe('server');
  });
});

describe('server rows while a mutation for the row is pending', () => {
  it('skips the remote apply on the seq path, so caches keep the optimistic description', async () => {
    seedCaches(row('optimistic'));
    buildPendingUpdate('task-1');
    serverReturns(row('server', { stx: written({ description: 'T2' }) }));

    const { status } = await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(status).toBe('ok');
    expect(detail()?.description).toBe('optimistic');
    expect(homeRow()?.description).toBe('optimistic');
    expect(filteredRow()?.description).toBe('optimistic');
  });

  it('does not even fetch the row on the seq-less path', async () => {
    seedCaches(row('optimistic'));
    buildPendingUpdate('task-1');
    const queryFn = detailFetchReturns(row('server'));

    await fetchEntityAndUpdateList('task-1', keys, 'update', 'org-1', 'tenant-1', TASK_PRODUCT);

    expect(queryFn).not.toHaveBeenCalled();
    expect(detail()?.description).toBe('optimistic');
  });
});

describe('Yjs-owned fields on a server row', () => {
  // The relay has not saved yet: the server row holds the older body under the seeded row's stamp.
  const staleRead = () => row('older');

  it('keeps a collaborative patch over a read carrying the cached stamp, in the detail and every list', async () => {
    seedCaches(row('older'));
    patchCollaborativeDescription(TASK_PRODUCT, row('older'), 'newer');
    serverReturns(staleRead());

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(detail()?.description).toBe('newer');
    expect(homeRow()?.description).toBe('newer');
    expect(filteredRow()?.description).toBe('newer');
  });

  it('takes the description from a server write of it, which carries a new stamp', async () => {
    seedCaches(row('older'));
    patchCollaborativeDescription(TASK_PRODUCT, row('older'), 'newer');
    serverReturns(row('saved', { stx: written({ description: 'T2' }) }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    for (const cached of [detail(), homeRow(), filteredRow()]) {
      expect(cached).toMatchObject({ description: 'saved', stx: { fieldTimestamps: { description: 'T2' } } });
    }
  });

  it('applies an incoming row without a stamp, even over a cached row without one', async () => {
    seedCaches(row('local', { stx: written({}) }));
    serverReturns(row('server', { stx: written({}) }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(detail()?.description).toBe('server');
    expect(homeRow()?.description).toBe('server');
  });

  it('keeps the patch in the lists and builds the new detail from a list copy when no detail is cached', async () => {
    seedCaches(row('older'), { withDetail: false });
    patchCollaborativeDescription(TASK_PRODUCT, row('older'), 'newer');
    serverReturns(staleRead());

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(homeRow()?.description).toBe('newer');
    expect(filteredRow()?.description).toBe('newer');
    expect(detail()?.description).toBe('newer');
  });

  it('keeps each cached copy its own description, while stx and other fields take the server values', async () => {
    seedCaches(row('list body'), { withDetail: false });
    queryClient.setQueryData(detailKey, row('detail body'));
    const serverStx = written({ description: 'T1', name: 'T2' });
    serverReturns(row('server', { name: 'Renamed', stx: serverStx }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    expect(detail()).toMatchObject({ description: 'detail body', name: 'Renamed', stx: serverStx });
    expect(homeRow()).toMatchObject({ description: 'list body', name: 'Renamed', stx: serverStx });
    expect(filteredRow()).toMatchObject({ description: 'list body', name: 'Renamed', stx: serverStx });
  });

  it('guards the seq-less fetch, which writes the detail before applying', async () => {
    seedCaches(row('older'));
    patchCollaborativeDescription(TASK_PRODUCT, row('older'), 'newer');
    const queryFn = detailFetchReturns(staleRead());

    await fetchEntityAndUpdateList('task-1', keys, 'update', 'org-1', 'tenant-1', TASK_PRODUCT);

    expect(queryFn).toHaveBeenCalledOnce();
    expect(detail()?.description).toBe('newer');
    expect(homeRow()?.description).toBe('newer');
    expect(filteredRow()?.description).toBe('newer');
  });

  it('keeps a patch made while the seq-less fetch was in flight', async () => {
    seedCaches(row('older'));
    queryClient.setQueryDefaults(keys.detail.base, {
      queryFn: async () => {
        patchCollaborativeDescription(TASK_PRODUCT, row('older'), 'typed meanwhile');
        return staleRead();
      },
    });

    await fetchEntityAndUpdateList('task-1', keys, 'update', 'org-1', 'tenant-1', TASK_PRODUCT);

    expect(detail()?.description).toBe('typed meanwhile');
    expect(homeRow()?.description).toBe('typed meanwhile');
  });

  it('guards a seq-less fetch of a row no list holds by the detail cached before the fetch', async () => {
    queryClient.setQueryData(detailKey, row('newer'));
    detailFetchReturns(staleRead());

    await fetchEntityAndUpdateList('task-1', keys, 'update', 'org-1', 'tenant-1', TASK_PRODUCT);

    expect(detail()?.description).toBe('newer');
  });

  it('compares a field with a stamp of its own by that stamp', async () => {
    registerYjsOwnedFields(TASK_PRODUCT, ['description', 'summary']);
    seedCaches(row('patched', { summary: 'patched summary', stx: written({ description: 'T1', summary: 'S1' }) }));
    serverReturns(row('server', { summary: 'server summary', stx: written({ description: 'T2', summary: 'S1' }) }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);

    for (const cached of [detail(), homeRow(), filteredRow()]) {
      expect(cached).toMatchObject({ description: 'server', summary: 'patched summary' });
    }
  });

  it('guards a derived field by the description stamp', async () => {
    registerYjsOwnedFields(TASK_PRODUCT, ['description', 'keywords']);
    seedCaches(row('patched', { keywords: 'patched words' }));
    serverReturns(row('older', { keywords: 'older words' }));

    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '5,5', keys);
    expect(homeRow()).toMatchObject({ description: 'patched', keywords: 'patched words' });

    serverReturns(row('saved', { keywords: 'saved words', stx: written({ description: 'T2' }) }));
    await fetchRangeAndPatch(TASK, 'org-1', 'tenant-1', '6,6', keys);
    expect(homeRow()).toMatchObject({ description: 'saved', keywords: 'saved words' });
    expect(detail()).toMatchObject({ description: 'saved', keywords: 'saved words' });
  });
});

describe('stream echo of a write from this tab', () => {
  it('patches only the cached field timestamps in place, without fetching or notifying observers', async () => {
    const cached = row('mine');
    seedCaches(cached);
    const deltaFetch = vi.fn(async () => ({ items: [row('server')], total: 1 }));
    registerEntityQueryKeys(TASK, keys, deltaFetch);
    const cacheEvents: string[] = [];
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => cacheEvents.push(event.type));
    const detailBefore = detail();

    handleAppStreamNotification({
      kind: 'product',
      action: 'update',
      productType: TASK_PRODUCT,
      resourceType: null,
      subjectId: 'task-1',
      organizationId: 'org-1',
      tenantId: 'tenant-1',
      channelType: null,
      path: null,
      seq: 6,
      channelId: 'project-1',
      stx: { mutationId: 'm-echo', sourceId, fieldTimestamps: { description: 'T9' } },
      batchUntilSeq: null,
      count: null,
      spreadWindow: null,
      propagation: null,
    } as Parameters<typeof handleAppStreamNotification>[0]);
    await flushAllNow();
    unsubscribe();

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(cacheEvents).toEqual([]);
    expect(detail()).toBe(detailBefore);
    expect(detail()).toMatchObject({
      description: 'mine',
      stx: { mutationId: 'm-1', sourceId: 'other-tab', fieldTimestamps: { description: 'T9' } },
    });
    expect(homeRow()?.stx.fieldTimestamps).toEqual({ description: 'T9' });
    expect(filteredRow()?.stx.fieldTimestamps).toEqual({ description: 'T9' });
  });
});

describe('patchCollaborativeDescription', () => {
  it('patches the detail and every org list holding the row synchronously, with updatedAt and extra fields, leaving stx alone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T10:00:00.000Z'));
    const cached = row('before');
    seedCaches(cached);
    const otherOrgKey = keys.list.home('org-2', 'project-9');
    queryClient.setQueryData(otherOrgKey, listOf(cached));
    const otherOrgData = queryClient.getQueryData(otherOrgKey);

    patchCollaborativeDescription(TASK_PRODUCT, cached, 'after', { name: 'Derived title' });

    const expected = { description: 'after', name: 'Derived title', updatedAt: '2026-10-02T10:00:00.000Z', stx: cached.stx };
    expect(detail()).toMatchObject(expected);
    expect(homeRow()).toMatchObject(expected);
    expect(filteredRow()).toMatchObject(expected);
    expect(detail()?.stx).toBe(cached.stx);
    expect(queryClient.getQueryData(otherOrgKey)).toBe(otherOrgData);
  });

  it('creates no detail entry when none is cached and still patches the lists', () => {
    seedCaches(row('before'), { withDetail: false });

    patchCollaborativeDescription(TASK_PRODUCT, row('before'), 'after');

    expect(queryClient.getQueryState(detailKey)).toBeUndefined();
    expect(homeRow()?.description).toBe('after');
    expect(filteredRow()?.description).toBe('after');
  });

  it('copies the detail row into the lists along with the patch', () => {
    queryClient.setQueryData(detailKey, { ...row('before'), detailOnly: true });
    queryClient.setQueryData(homeKey, listOf(row('before')));

    patchCollaborativeDescription(TASK_PRODUCT, row('before'), 'after');

    expect(homeRow()).toMatchObject({ description: 'after', detailOnly: true });
  });
});

describe('persistStandaloneDescription', () => {
  it('calls the update with the description when it differs from the entity and the row is cached', async () => {
    seedCaches(row('before'));
    const update = vi.fn(async () => undefined);

    await persistStandaloneDescription(TASK_PRODUCT, row('before'), 'after', update);

    expect(update).toHaveBeenCalledExactlyOnceWith({ description: 'after' });
  });

  it('skips a description equal to the entity it was given, whatever the cache holds', async () => {
    seedCaches(row('newer'));
    const update = vi.fn(async () => undefined);

    await persistStandaloneDescription(TASK_PRODUCT, row('older'), 'older', update);
    expect(update).not.toHaveBeenCalled();

    await persistStandaloneDescription(TASK_PRODUCT, row('older'), 'newer', update);
    expect(update).toHaveBeenCalledExactlyOnceWith({ description: 'newer' });
  });

  it('skips a row that is no longer cached', async () => {
    const update = vi.fn(async () => undefined);

    await persistStandaloneDescription(TASK_PRODUCT, row('before'), 'after', update);

    expect(update).not.toHaveBeenCalled();
  });
});

describe('useDescriptionUpdate', () => {
  it('patches the caches in a collaborative session and calls the update otherwise', async () => {
    seedCaches(row('before'));
    const update = vi.fn(async () => undefined);
    const updateData = useDescriptionUpdate(TASK_PRODUCT, row('before'), update);

    await updateData('collaborative', true);
    expect(update).not.toHaveBeenCalled();
    expect(homeRow()?.description).toBe('collaborative');

    await updateData('standalone', false);
    expect(update).toHaveBeenCalledExactlyOnceWith({ description: 'standalone' });
    expect(homeRow()?.description).toBe('collaborative');
  });
});
