import type { PostAppCatchupResponse } from 'sdk';
import type { EntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSyncDeliveryTrusted, setSyncDeliveryTrusted } from '~/query/basic/sync-stale-state';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Real builder and resolvers over a synthetic sub-org hierarchy; only the app-bound config and hierarchy singletons are replaced.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('attachment', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: {
      slug: 'test',
      channelEntityTypes: hierarchy.channelTypes,
      entityIdColumnKeys: hierarchy.idColumnKeys,
      seenTrackedProductTypes: [],
      productEmbeddings: [{ embeddedProduct: 'label', hostProduct: 'attachment', hostColumn: 'labels' }],
    },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

// Real propagation, observed: the deferral tests assert when it runs relative to the delta fetch.
const propagateEmbeddingsSpy = vi.fn();
vi.mock('./propagation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./propagation')>();
  return {
    ...actual,
    propagateEmbeddings: (hint: Parameters<typeof actual.propagateEmbeddings>[0]) => {
      propagateEmbeddingsSpy(hint);
      return actual.propagateEmbeddings(hint);
    },
  };
});

vi.mock('./membership-ops', () => ({
  invalidateChannelList: vi.fn(),
  invalidateMemberQueries: vi.fn(),
  fetchMemberships: vi.fn(),
  refreshMe: vi.fn(),
}));

vi.mock('./sync-priority', () => ({
  getTenantIdForOrg: vi.fn(() => null),
  // Viewing tier by default, so catchup flushes inline through the fetch prioritizer.
  getSyncTier: vi.fn(() => ({ min: 0, max: 0 })),
  isViewingChannel: () => true,
}));

// The real fetch prioritizer runs as the single fetch path; only its outward boundaries are mocked.
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: vi.fn() }));
vi.mock('~/query/offline/stx-utils', () => ({ sourceId: 'test-source' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));

stubLocalStorage();

// The synthetic 'label' product exists only in this file's shared mock, hence the cast.
const LABEL = 'label' as EntityType;

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { syncStore } = await import('~/query/realtime/sync-store');
const { flushAllNow, resetFetchPrioritizer } = await import('./fetch-prioritizer');
const { processAppCatchup } = await import('./catchup-processor');

// The real fetch prioritizer holds module state (dirty map, timer), cleared between tests.
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
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('uses the pre-catchup org-view cursor for the delta fetch', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh', seq: 6 }],
      total: 1,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1', name: 'stale' });
    queryClient.setQueryData(keys.list.org('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }],
      total: 1,
    });

    await processAppCatchup(okViewResponse(6));

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,6', undefined);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toMatchObject({ name: 'fresh' });
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({
      items: [{ id: 'attachment-1', entityType: 'attachment', organizationId: 'org-1', name: 'fresh', seq: 6 }],
      total: 1,
    });
  });

  it('fetches the gap of the tab that processes the answer: a follower behind the leader reads from its own cursor', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh', seq: 6 }],
      total: 1,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);
    const staleList = { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 };
    const answer = okViewResponse(6);

    // The leader was at 5 when it sent the request this answers.
    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 5);
    queryClient.setQueryData(keys.list.org('org-1'), staleList);
    await processAppCatchup(answer);
    expect(deltaFetch).toHaveBeenLastCalledWith('org-1', 'tenant-1', '6,6', undefined);

    // A follower's store and cache: it missed more than the leader did, and the same answer is all it gets.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 2);
    queryClient.setQueryData(keys.list.org('org-1'), staleList);
    await processAppCatchup(answer);

    expect(deltaFetch).toHaveBeenLastCalledWith('org-1', 'tenant-1', '3,6', undefined);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toMatchObject({ items: [{ id: 'attachment-1', name: 'fresh' }] });
  });

  it('an org view subsumes child-homed rows: one fetch patches rows from any channel', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [
        { id: 'att-org', organizationId: 'org-1', name: 'fresh-org', seq: 11 },
        { id: 'att-proj', organizationId: 'org-1', projectId: 'proj-9', name: 'fresh-proj', seq: 12 },
      ],
      total: 2,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 10);
    queryClient.setQueryData(keys.detail.byId('att-proj'), { id: 'att-proj', organizationId: 'org-1', projectId: 'proj-9', name: 'stale' });
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(12, 2));

    // ONE org-wide fetch, no per-channel drill-down needed.
    expect(deltaFetch).toHaveBeenCalledTimes(1);
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '11,12', undefined);
    expect(queryClient.getQueryData(keys.detail.byId('att-proj'))).toMatchObject({ name: 'fresh-proj' });
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
  });

  it('never advances the cursor silently: a failed delta fetch invalidates before advancing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(okViewResponse(9));

    // Fetch failed → list invalidated (recovery handed to react-query), THEN cursor advanced.
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });

  it('short delivery (ok but empty window) holds the cursor, invalidates, and degrades trust', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    // ok status but no rows reach the promised frontier: the delivery fell short.
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    setSyncDeliveryTrusted(true);
    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(okViewResponse(9));

    // Fetched the window, but reachedSeq (0) < frontier (9): the cursor must not advance.
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,9', undefined);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    expect(isSyncDeliveryTrusted()).toBe(false);
  });

  it('skips the delta fetch for orgs with nothing cached (scope-symmetry guard), still advancing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);

    await processAppCatchup(okViewResponse(6));

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
  });

  it('a baseline view (cursor 0) stores the frontier without fetching', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    await processAppCatchup(okViewResponse(42));

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(42);
  });

  it('a first connection refetches a list that was read before its stream was live, and stores the frontier', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);
    // The route loader was first: its rows are from before the subscription, so the frontier cannot vouch for them.
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'loaded' }], total: 1 });

    await processAppCatchup(okViewResponse(42), true);

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(42);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
  });

  it('a caught-up view (frontier <= cursor) neither fetches nor invalidates the cached list', async () => {
    // Reload contract: a cursor at the frontier confirms the warm cache without refetching. A fresh org avoids count-drift comparison in the module-level tracker.
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-caughtup', 'tenant-1');
    syncStore.getState().setOrgSeq('org-caughtup', 'attachment', 6);
    queryClient.setQueryData(keys.list.org('org-caughtup'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // Server frontier equals the ingested cursor: no new sequence positions since last sync.
    await processAppCatchup(okViewResponse(6, 0, 'org-caughtup:attachment'));

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-caughtup') }));
    expect(syncStore.getState().getOrgSeq('org-caughtup', 'attachment')).toBe(6);
  });

  it('an opaque view falls back to invalidation of cached lists, no numbers consumed', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
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
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
  });

  it('refetches embedded-product lists on the fallback branches that never ingest host rows', async () => {
    // Usage aggregates are derived from host references; a branch that skips the rows cannot verify them.
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const labelKeys = createEntityKeys<Record<string, never>>(LABEL);
    registerEntityQueryKeys(
      'attachment',
      keys,
      vi.fn(async () => ({ items: [], total: 0 })),
    );
    registerEntityQueryKeys(
      LABEL,
      labelKeys,
      vi.fn(async () => ({ items: [], total: 0 })),
    );

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    queryClient.setQueryData(labelKeys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {},
      views: [{ key: 'org-1:attachment', status: 'opaque' }],
    } as unknown as PostAppCatchupResponse);

    expect(queryClient.getQueryState(labelKeys.list.org('org-1'))?.isInvalidated).toBe(true);
  });

  it('invalidates org lists when a server count CHANGES between catchups (never vs cached totals)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 6);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 5 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // First sight: count recorded, no comparison, no invalidation from integrity.
    await processAppCatchup(okViewResponse(6, 5));
    const callsAfterFirst = invalidateSpy.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1'))).length;

    // Same count again: still no signal.
    await processAppCatchup(okViewResponse(6, 5));
    const callsAfterSecond = invalidateSpy.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1'))).length;
    expect(callsAfterSecond).toBe(callsAfterFirst);

    // Count changed while frontier did not: drift → invalidate.
    await processAppCatchup(okViewResponse(6, 7));
    const callsAfterThird = invalidateSpy.mock.calls.filter((c) => JSON.stringify(c[0]?.queryKey) === JSON.stringify(keys.list.org('org-1'))).length;
    expect(callsAfterThird).toBeGreaterThan(callsAfterSecond);
  });
});

describe('catchup after the server rebuilt its sync books', () => {
  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  const cached = (keys: { list: { org: (id: string) => readonly unknown[] }; detail: { byId: (id: string) => readonly unknown[] } }) => {
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 });
    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1', name: 'stale' });
  };

  it('must not fetch a range from a cursor of the old books: it refetches what is cached and takes the frontier as its baseline', async () => {
    vi.useFakeTimers();
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);
    syncStore.getState().adoptGeneration(1);
    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    // Sequence values were handed out again after the rebuild: 40 says nothing about the books the frontier 12 belongs to.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 40);
    cached(keys);

    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(deltaFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().generation).toBe(2);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.detail.byId('attachment-1'))?.isInvalidated).toBe(true);
  });

  it('fetches the range as always while the generation is the one it holds (positive control)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh', seq: 6 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);
    syncStore.getState().adoptGeneration(2);
    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    cached(keys);

    await processAppCatchup({ ...okViewResponse(6), generation: 2 });

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,6', undefined);
    expect(queryClient.getQueryState(keys.detail.byId('attachment-1'))?.isInvalidated).toBe(false);
  });
});

describe('registered grant-boundary views', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  const declare = () =>
    syncStore.getState().declareSyncView('org-1:attachment:subtree', {
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
    syncStore.getState().setViewCursor('org-1:attachment:subtree', 10);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup(answer({ status: 'ok', frontiers: { attachment: 10 } }));
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));

    await processAppCatchup(answer({ status: 'ok', frontiers: { attachment: 15 } }));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    expect(syncStore.getState().getView('org-1:attachment:subtree')?.cursor).toBe(15);
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
    expect(syncStore.getState().getView('org-1:attachment:subtree')?.cursor).toBe(33);
    expect(invalidateSpy).not.toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));

    await processAppCatchup(answer({ status: 'forbidden' }));
    expect(syncStore.getState().getView('org-1:attachment:subtree')).toBeUndefined();
  });
});

describe('catchup → fetch prioritizer fold', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('enqueues background orgs lazily and advances their cursor only at flush', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2000, max: 30_000 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(9));

    // Advance-at-flush: the fetch prioritizer owns the cursor for enqueued ranges.
    expect(deltaFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);

    await flushAllNow();
    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5,9', undefined);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });

  it('defers a background org propagation hint to the flush that ingests the fresh embedded rows', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2000, max: 30_000 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'labels', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), changes: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
    await processAppCatchup(response);

    // The hint waits for the range that carries the fresh embedded rows.
    expect(deltaFetch).not.toHaveBeenCalled();
    expect(propagateEmbeddingsSpy).not.toHaveBeenCalled();

    await flushAllNow();
    expect(deltaFetch).toHaveBeenCalledTimes(1);
    expect(propagateEmbeddingsSpy).toHaveBeenCalledTimes(1);
    expect(propagateEmbeddingsSpy).toHaveBeenCalledWith(hint);
  });

  it('propagates at once for a viewing org, whose delta fetch was awaited inline', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 0, max: 0 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    syncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'labels', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), changes: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
    await processAppCatchup(response);

    expect(deltaFetch).toHaveBeenCalledTimes(1);
    expect(propagateEmbeddingsSpy).toHaveBeenCalledTimes(1);
  });
});
