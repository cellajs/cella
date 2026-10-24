import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
      retention: { activityDays: 90 },
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

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys, syncChunkSize } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { syncStore } = await import('~/query/realtime/sync-store');
const { flushAllNow, resetFetchPrioritizer } = await import('./fetch-prioritizer');
const { processAppCatchup } = await import('./catchup-processor');

// The real fetch prioritizer holds module state (dirty map, timer), cleared between tests.
afterEach(() => resetFetchPrioritizer());

/** The org-wide range fetch request for org-1 the catchup should make. */
const rangeRequest = (afterSeq: number, untilSeq: number) => ({
  organizationId: 'org-1',
  tenantId: 'tenant-1',
  channelId: undefined,
  query: { afterSeq, untilSeq, limit: syncChunkSize },
});

/** Views-contract response with one org view answer for attachment. */
const okViewResponse = (frontier: number): PostAppCatchupResponse =>
  ({
    cursor: 'cursor-1',
    changes: {},
    views: [{ key: 'org-1:attachment', status: 'ok', frontiers: { attachment: frontier }, counts: { attachment: 1 } }],
  }) as unknown as PostAppCatchupResponse;

describe('catchup processor (view-driven)', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('fetches the gap of the tab that processes the answer: a follower behind the leader reads from its own cursor', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh', seq: 6 }],
      total: 1,
    }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    const staleList = { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 };
    const answer = okViewResponse(6);

    // The leader was at 5 when it sent the request this answers.
    syncStore.getState().trackOrg('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 5);
    queryClient.setQueryData(keys.list.org('org-1'), staleList);
    await processAppCatchup(answer);
    expect(rangeFetch).toHaveBeenLastCalledWith(rangeRequest(5, 6));

    // A follower's store and cache: it missed more than the leader did, and the same answer is all it gets.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 2);
    queryClient.setQueryData(keys.list.org('org-1'), staleList);
    await processAppCatchup(answer);

    expect(rangeFetch).toHaveBeenLastCalledWith(rangeRequest(2, 6));
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toMatchObject({ items: [{ id: 'attachment-1', name: 'fresh' }] });
  });

  it('a first connection refetches a list that was read before its stream was live, and stores the frontier', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    // The route loader was first: its rows are from before the subscription, so the frontier cannot vouch for them.
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'loaded' }], total: 1 });

    await processAppCatchup(okViewResponse(42), true);

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(42);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
  });

  it('an opaque view falls back to invalidation of cached lists, no numbers consumed', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {},
      views: [{ key: 'org-1:attachment', status: 'opaque' }],
    } as unknown as PostAppCatchupResponse);

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    // Cursor untouched: opaque answers carry no frontier to advance to.
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
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
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    syncStore.getState().adoptGeneration(1);
    syncStore.getState().trackOrg('org-1', 'tenant-1');
    // Sequence values were handed out again after the rebuild: 40 says nothing about the books the frontier 12 belongs to.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 40);
    cached(keys);

    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().generation).toBe(2);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(keys.detail.byId('attachment-1'))?.isInvalidated).toBe(true);
  });
});

describe('catchup after the device was away longer than the activity window', () => {
  afterEach(() => {
    vi.useRealTimers();
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  // The server removes tombstones older than the deleted-items period, so a range from a cursor that old can miss deletes.
  it('must not fetch a range from its old cursor: it refetches what is cached and takes the frontier as its baseline', async () => {
    vi.useFakeTimers();
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    syncStore.getState().adoptGeneration(1);
    syncStore.getState().trackOrg('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 40);
    syncStore.getState().markCaughtUp();
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 });

    vi.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000);
    await processAppCatchup({ ...okViewResponse(52), generation: 1 });
    await vi.advanceTimersByTimeAsync(10_000);

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(52);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
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
});

describe('catchup → fetch prioritizer fold', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  it("holds a background org's catchup to its flush: the range fetch, the cursor and the propagation hint all wait for it", async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2000, max: 30_000 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().trackOrg('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'labels', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), changes: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
    await processAppCatchup(response);

    // The hint waits for the range that carries the fresh embedded rows, and the cursor for their ingestion.
    expect(rangeFetch).not.toHaveBeenCalled();
    expect(propagateEmbeddingsSpy).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);

    await flushAllNow();
    expect(rangeFetch).toHaveBeenCalledExactlyOnceWith(rangeRequest(4, 9));
    expect(propagateEmbeddingsSpy).toHaveBeenCalledExactlyOnceWith(hint);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });

  it('propagates at once for a viewing org, whose delta fetch was awaited inline', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 0, max: 0 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().trackOrg('org-1', 'tenant-1');
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', hostProduct: 'attachment', hostColumn: 'labels', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), changes: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
    await processAppCatchup(response);

    expect(rangeFetch).toHaveBeenCalledTimes(1);
    expect(propagateEmbeddingsSpy).toHaveBeenCalledTimes(1);
  });
});
