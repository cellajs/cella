import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    slug: 'test',
    channelEntityTypes: ['organization', 'project'],
    entityIdColumnKeys: { organization: 'organizationId', project: 'projectId' },
    seenTrackedProductTypes: [],
  },
  hierarchy: {
    getOrderedAncestors: (entityType: string) => {
      if (entityType === 'attachment') return ['project', 'organization'];
      return ['organization'];
    },
    getParent: () => null,
  },
  resolveDeepestAncestorId: (
    hierarchy: { getOrderedAncestors: (entityType: string) => readonly string[] },
    entityType: string,
    row: Record<string, unknown>,
  ) => {
    for (const type of hierarchy.getOrderedAncestors(entityType)) {
      const id = row[`${type}Id`];
      if (typeof id === 'string' && id) return id;
    }
    return null;
  },
}));

vi.mock('~/modules/common/blocknote/yjs-editor', () => ({
  isYjsEditorActive: () => false,
  getYjsOwnedFields: () => [],
}));

vi.mock('~/query/offline', () => ({
  sourceId: 'test-source',
}));

vi.mock('./membership-ops', () => ({
  invalidateChannelList: vi.fn(),
  invalidateMemberQueries: vi.fn(),
  fetchMemberships: vi.fn(),
  refreshMe: vi.fn(),
}));

vi.mock('./sync-priority', () => ({
  getTenantIdForOrg: vi.fn(() => null),
  // Viewing tier by default: catchup flushes inline through the fetch prioritizer (gap 4a fold).
  getSyncTier: vi.fn(() => ({ min: 0, max: 0 })),
  isViewingChannel: () => true,
}));

// The REAL fetch prioritizer runs (it is the consolidated fetch path); mock its outward boundaries.
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: vi.fn() }));
vi.mock('~/modules/seen/unseen-sync', () => ({ ingestSyncedRows: vi.fn() }));
vi.mock('~/query/offline/stx-utils', () => ({ sourceId: 'test-source' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
vi.stubGlobal('navigator', { onLine: true });
vi.stubGlobal('localStorage', {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(() => null),
  length: 0,
});

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { useSyncStore } = await import('~/query/realtime/sync-store');
const { flushAllNow, resetFetchPrioritizer } = await import('./fetch-prioritizer');
const { processAppCatchup } = await import('./catchup-processor');

// The real fetch prioritizer holds module state (dirty map, timer); clear it between tests.
afterEach(() => resetFetchPrioritizer());

/** Views-contract response with one org view answer for attachment. */
const okViewResponse = (frontier: number, count = 1, key = 'org-1:attachment'): PostAppCatchupResponse =>
  ({
    cursor: 'cursor-1',
    changes: {},
    views: [{ key, status: 'ok', frontiers: { attachment: frontier }, counts: { attachment: count } }],
  }) as unknown as PostAppCatchupResponse;

describe('catchup processor (view-driven)', () => {
  afterEach(() => {
    queryClient.clear();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('uses the pre-catchup org-view cursor for the delta fetch', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.detail.byId('attachment-1'), {
      id: 'attachment-1',
      organizationId: 'org-1',
      name: 'stale',
    });
    queryClient.setQueryData(keys.list.org('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }],
      total: 1,
    });

    await processAppCatchup(okViewResponse(6));

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,6', undefined);
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toMatchObject({ name: 'fresh' });
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    });
  });

  it('an org view subsumes child-homed rows: one fetch patches rows from any channel', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [
        { id: 'att-org', organizationId: 'org-1', name: 'fresh-org' },
        { id: 'att-proj', organizationId: 'org-1', projectId: 'proj-9', name: 'fresh-proj' },
      ],
      total: 2,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 10);
    queryClient.setQueryData(keys.detail.byId('att-proj'), {
      id: 'att-proj',
      organizationId: 'org-1',
      projectId: 'proj-9',
      name: 'stale',
    });
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(12, 2));

    // ONE org-wide fetch, no per-channel drill-down needed.
    expect(deltaFetch).toHaveBeenCalledTimes(1);
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '11,12', undefined);
    expect(queryClient.getQueryData(keys.detail.byId('att-proj'))).toMatchObject({ name: 'fresh-proj' });
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
  });

  it('never advances the cursor silently: a failed delta fetch invalidates before advancing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(okViewResponse(9));

    // Fetch failed → list invalidated (recovery handed to react-query), THEN cursor advanced.
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });

  it('skips the delta fetch for orgs with nothing cached (scope-symmetry guard), still advancing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);

    await processAppCatchup(okViewResponse(6));

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
  });

  it('a baseline view (cursor 0) stores the frontier without fetching', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    await processAppCatchup(okViewResponse(42));

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(42);
  });

  it('an opaque view falls back to invalidation of cached lists, no numbers consumed', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {},
      views: [{ key: 'org-1:attachment', status: 'opaque' }],
    } as unknown as PostAppCatchupResponse);

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    // Cursor untouched: opaque answers carry no frontier to advance to.
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
  });

  it('invalidates org lists when a server count CHANGES between catchups (never vs cached totals)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 6);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 5 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // First sight: count recorded, no comparison, no invalidation from integrity.
    await processAppCatchup(okViewResponse(6, 5));
    const callsAfterFirst = invalidateSpy.mock.calls.filter(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1')),
    ).length;

    // Same count again: still no signal.
    await processAppCatchup(okViewResponse(6, 5));
    const callsAfterSecond = invalidateSpy.mock.calls.filter(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1')),
    ).length;
    expect(callsAfterSecond).toBe(callsAfterFirst);

    // Count changed while frontier did not: drift → invalidate.
    await processAppCatchup(okViewResponse(6, 7));
    const callsAfterThird = invalidateSpy.mock.calls.filter(
      (c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1')),
    ).length;
    expect(callsAfterThird).toBeGreaterThan(callsAfterSecond);
  });
});

describe('registered grant-boundary views', () => {
  afterEach(() => {
    queryClient.clear();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  const declare = () =>
    useSyncStore.getState().declareSyncView('org-1:attachment:subtree', {
      organizationId: 'org-1',
      prefixes: ['org-1/c1'],
      entityTypes: ['attachment'],
      depth: 'subtree',
    });

  const answer = (over: Record<string, unknown>): PostAppCatchupResponse =>
    ({
      cursor: 'c',
      changes: {},
      views: [{ key: 'org-1:attachment:subtree', ...over }],
    }) as unknown as PostAppCatchupResponse;

  it('ok + unchanged frontier skips refetches; changed frontier invalidates and advances', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys(
      'attachment',
      keys,
      vi.fn(async () => ({ items: [], total: 0 })),
    );
    declare();
    useSyncStore.getState().setViewCursor('org-1:attachment:subtree', 10);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(answer({ status: 'ok', frontiers: { attachment: 10 } }));
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));

    await processAppCatchup(answer({ status: 'ok', frontiers: { attachment: 15 } }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    expect(useSyncStore.getState().getView('org-1:attachment:subtree')?.cursor).toBe(15);
  });

  it('baseline adopts frontier without invalidating; forbidden removes the view', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys(
      'attachment',
      keys,
      vi.fn(async () => ({ items: [], total: 0 })),
    );
    declare();
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(answer({ status: 'ok', frontiers: { attachment: 33 } }));
    expect(useSyncStore.getState().getView('org-1:attachment:subtree')?.cursor).toBe(33);
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));

    await processAppCatchup(answer({ status: 'forbidden' }));
    expect(useSyncStore.getState().getView('org-1:attachment:subtree')).toBeUndefined();
  });
});

describe('catchup → fetch prioritizer fold', () => {
  afterEach(() => {
    queryClient.clear();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('enqueues background orgs lazily and advances their cursor only at flush', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2000, max: 30_000 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(9));

    // Advance-at-flush: the fetch prioritizer owns the cursor for enqueued ranges.
    expect(deltaFetch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);

    await flushAllNow();
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,9', undefined);
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });

  it('still reconciles viewing orgs inline through the fetch prioritizer flush (mutation-replay gate)', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 0, max: 0 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(9));

    // Awaited before processAppCatchup resolved: the delta is already ingested here.
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,9', undefined);
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });
});
