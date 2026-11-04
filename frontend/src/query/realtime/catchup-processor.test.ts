import { QueryObserver } from '@tanstack/react-query';
import type { PostAppCatchupResponse } from 'sdk';
import type { ProductEntityType } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
vi.mock('~/query/realtime/propagation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/query/realtime/propagation')>();
  return {
    ...actual,
    propagateEmbeddings: (hint: Parameters<typeof actual.propagateEmbeddings>[0]) => {
      propagateEmbeddingsSpy(hint);
      return actual.propagateEmbeddings(hint);
    },
  };
});

vi.mock('~/query/realtime/membership-ops', () => ({
  invalidateChannelList: vi.fn(),
  invalidateMemberQueries: vi.fn(),
  fetchMemberships: vi.fn(),
}));

vi.mock('~/query/realtime/sync-priority', () => ({
  getTenantIdForOrg: () => 'tenant-1',
  // Viewing tier by default, so catchup flushes inline through the fetch prioritizer.
  getSyncTier: vi.fn(() => ({ min: 0, max: 0 })),
  isViewingChannel: () => true,
}));

// The real fetch prioritizer runs as the single fetch path; only its outward boundaries are mocked.
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: vi.fn() }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'test-source' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));

stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys, syncChunkSize } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { syncStore } = await import('~/query/realtime/sync-store');
const { flushAllNow, resetFetchPrioritizer } = await import('~/query/realtime/fetch-prioritizer');
const { processAppCatchup } = await import('~/query/realtime/catchup-processor');
const { fetchMemberships } = await import('~/query/realtime/membership-ops');
const { handleStreamSignal } = await import('~/query/realtime/signal-handlers');
const { defineFrontendModule } = await import('~/lib/module');

const channelDeleted = vi.fn();
defineFrontendModule({
  name: 'catchup-test',
  owner: 'cella',
  scope: ['frontend'],
  description: 'Hears channel.deleted',
  signals: { 'channel.deleted': channelDeleted },
});

// The real fetch prioritizer holds module state (dirty map, timer), cleared between tests.
afterEach(() => resetFetchPrioritizer());
// A device that caught up before, unless a case starts from a fresh store.
beforeEach(() => syncStore.getState().markCaughtUp());

/** The org-wide range fetch request for org-1 the catchup should make. */
const rangeRequest = (afterSeq: number, untilSeq: number) => ({
  organizationId: 'org-1',
  tenantId: 'tenant-1',
  channelId: undefined,
  query: { afterSeq, untilSeq, limit: syncChunkSize },
});

/** Views-contract response with one org view answer for attachment. */
const okViewResponse = (frontier: number): PostAppCatchupResponse => ({
  organizations: {},
  views: [{ organizationId: 'org-1', entityType: 'attachment', status: 'ok', frontier }],
});

/** The org-1 list mounted, as on screen, counting the list requests it sends. */
const observeList = (queryKey: readonly unknown[]) => {
  const listFetch = vi.fn(async () => ({ items: [], total: 0 }));
  const unsubscribe = new QueryObserver(queryClient, { queryKey, queryFn: listFetch, staleTime: Number.POSITIVE_INFINITY }).subscribe(() => {});
  return { listFetch, unsubscribe };
};

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

  // A cascaded delete stamps no seq, so a read of the range never reaches a frontier row that left with its channel.
  it('must not hold the cursor at a frontier no fetch can deliver: the next catchup fetches nothing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'attachment-6', organizationId: 'org-1', seq: 6 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup(okViewResponse(9));
    await processAppCatchup(okViewResponse(9));

    expect(rangeFetch).toHaveBeenCalledExactlyOnceWith(rangeRequest(4, 9));
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
  });

  it('a first connection refetches a list that was read before its stream was live and stores the frontier, from which the next one reads', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'renamed', seq: 43 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    // A fresh profile. The route loader was first: its rows are from before the subscription, so the frontier cannot vouch for them.
    syncStore.getState().reset();
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'loaded' }], total: 1 });

    await processAppCatchup(okViewResponse(42));

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(fetchMemberships).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(42);
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);

    // The reload's catchup.
    await processAppCatchup(okViewResponse(43));

    expect(rangeFetch).toHaveBeenCalledExactlyOnceWith(rangeRequest(42, 43));
    expect(fetchMemberships).toHaveBeenCalledOnce();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(43);
  });

  it('an opaque view falls back to invalidation of cached lists, no numbers consumed', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await processAppCatchup({ organizations: {}, views: [{ organizationId: 'org-1', entityType: 'attachment', status: 'opaque' }] });

    expect(rangeFetch).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: keys.list.org('org-1') }));
    // Cursor untouched: opaque answers carry no frontier to advance to.
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
  });

  it("moves an opaque view's cursor to the highest position its embedding hint read, and refetches the hosts of the rows it names", async () => {
    // The config embeds labels in attachments; a label view the server answers opaque. Labels exist only in that config, hence the cast.
    const label = 'label' as ProductEntityType;
    const labelKeys = createEntityKeys<Record<string, never>>(label);
    const attachmentKeys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys(label, labelKeys, vi.fn());
    registerEntityQueryKeys('attachment', attachmentKeys, vi.fn());
    syncStore.getState().setOrgSeq('org-1', label, 4);
    // What the cache held before: the host's copy of the label and the label's detail, both from before the rename.
    queryClient.setQueryData(attachmentKeys.list.org('org-1'), {
      items: [{ id: 'att-1', organizationId: 'org-1', labels: [{ id: 'label-1', name: 'old' }] }],
      total: 1,
    });
    queryClient.setQueryData(labelKeys.detail.byId('label-1'), { id: 'label-1', name: 'old' });

    await processAppCatchup({
      organizations: { 'org-1': { propagation: [{ embeddedProduct: label, update: ['label-1'], remove: [], untilSeq: 9 }] } },
      views: [{ organizationId: 'org-1', entityType: label, status: 'opaque' }],
    });

    expect(syncStore.getState().getOrgSeq('org-1', label)).toBe(9);
    // Nothing fetched the renamed label: past the moved cursor no later read would name it, so its copies are marked here.
    expect(queryClient.getQueryState(attachmentKeys.list.org('org-1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(labelKeys.detail.byId('label-1'))?.isInvalidated).toBe(true);
  });
});

describe('catchup after the server rebuilt its sync books', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  /** A store of generation 1 whose cursor of the old books is 40, with the list on screen and a detail cached. */
  const startOnOldBooks = () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    syncStore.getState().adoptGeneration(1);
    // Sequence values were handed out again after the rebuild: 40 says nothing about the books the frontier 12 belongs to.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 40);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 });
    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1', name: 'stale' });
    return { keys, rangeFetch, ...observeList(keys.list.org('org-1')) };
  };

  it('must not fetch a range from a cursor of the old books: it refetches what is cached once, at its share of the spread, and takes the frontier as its baseline', async () => {
    const { keys, rangeFetch, listFetch, unsubscribe } = startOnOldBooks();

    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    // Every client hears of the rebuild at once: none refetches before its share of the spread.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(listFetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(listFetch).toHaveBeenCalledOnce();
    expect(rangeFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().generation).toBe(2);
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
    expect(queryClient.getQueryState(keys.detail.byId('attachment-1'))?.isInvalidated).toBe(true);
    unsubscribe();
  });

  it('must not lose the refetch to a reload before its share of the spread: the next catchup arms it again, the one after does not repeat it', async () => {
    const { listFetch, unsubscribe } = startOnOldBooks();

    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    // The tab reloads: its timer is gone, the store it persisted with the cursor reset is not.
    vi.clearAllTimers();
    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listFetch).toHaveBeenCalledOnce();

    await processAppCatchup({ ...okViewResponse(12), generation: 2 });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listFetch).toHaveBeenCalledOnce();
    unsubscribe();
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
  it('must not fetch a range from its old cursor: it refetches what is cached once, at once, and takes the frontier as its baseline', async () => {
    vi.useFakeTimers();
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);
    syncStore.getState().adoptGeneration(1);
    syncStore.getState().setOrgSeq('org-1', 'attachment', 40);
    syncStore.getState().markCaughtUp();
    queryClient.setQueryData(keys.list.org('org-1'), { items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'stale' }], total: 1 });
    const { listFetch, unsubscribe } = observeList(keys.list.org('org-1'));

    vi.setSystemTime(Date.now() + 91 * 24 * 60 * 60 * 1000);
    await processAppCatchup({ ...okViewResponse(52), generation: 1 });
    await vi.advanceTimersByTimeAsync(0);
    expect(listFetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(listFetch).toHaveBeenCalledOnce();
    expect(rangeFetch).not.toHaveBeenCalled();
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(52);
    unsubscribe();
  });
});

describe('catchup → fetch prioritizer fold', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  it("holds a background org's catchup to its flush: the range fetch, the cursor and the propagation hint all wait for it", async () => {
    const { getSyncTier } = await import('~/query/realtime/sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2000, max: 30_000 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), organizations: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
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
    const { getSyncTier } = await import('~/query/realtime/sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 0, max: 0 });

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const rangeFetch = vi.fn(async () => ({ items: [{ id: 'att-1', organizationId: 'org-1', seq: 9 }], total: 1 }));
    registerEntityQueryKeys('attachment', keys, rangeFetch);

    syncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    const hint = { embeddedProduct: 'attachment', update: ['host-1'], remove: [] };
    const response = { ...okViewResponse(9), organizations: { 'org-1': { propagation: [hint] } } } as PostAppCatchupResponse;
    await processAppCatchup(response);

    expect(rangeFetch).toHaveBeenCalledTimes(1);
    expect(propagateEmbeddingsSpy).toHaveBeenCalledTimes(1);
  });
});

describe('a versioned signal heard live', () => {
  afterEach(() => {
    queryClient.clear();
    syncStore.getState().reset();
    vi.clearAllMocks();
  });

  /** A catchup answer that holds only the organization's version of `channel.deleted`. */
  const signalsAnswer = (version: number): PostAppCatchupResponse => ({ organizations: { 'org-1': { signals: { 'channel.deleted': version } } } });
  const deleted = (version: number) => ({ type: 'channel.deleted', organizationId: 'org-1', subjectId: `project-${version}`, version });

  it('is not run again at the next catchup', async () => {
    syncStore.getState().setSignalVersion('org-1', 'channel.deleted', 3);

    handleStreamSignal(deleted(4));
    await processAppCatchup(signalsAnswer(4));

    expect(channelDeleted).toHaveBeenCalledExactlyOnceWith(deleted(4), { missed: false });
  });

  it('must not hide one missed across a stream break: the next catchup still runs it', async () => {
    syncStore.getState().setSignalVersion('org-1', 'channel.deleted', 3);

    // Version 4 went out while the stream was down; 5 arrives on the new stream.
    handleStreamSignal(deleted(5));
    await processAppCatchup(signalsAnswer(5));

    expect(channelDeleted.mock.calls).toEqual([
      [deleted(5), { missed: false }],
      [{ type: 'channel.deleted', organizationId: 'org-1', subjectId: null }, { missed: true }],
    ]);
    expect(syncStore.getState().getSignalVersion('org-1', 'channel.deleted')).toBe(5);
  });

  it('must not take the version of one whose live handler threw: the next catchup runs it again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    syncStore.getState().setSignalVersion('org-1', 'channel.deleted', 3);
    channelDeleted.mockImplementationOnce(() => {
      throw new Error('handler failed');
    });

    handleStreamSignal(deleted(4));
    await processAppCatchup(signalsAnswer(4));

    expect(channelDeleted).toHaveBeenLastCalledWith({ type: 'channel.deleted', organizationId: 'org-1', subjectId: null }, { missed: true });
    vi.mocked(console.error).mockRestore();
  });

  it('must not hide one after the books were rebuilt, whose new count reaches the stored version by coincidence', async () => {
    vi.useFakeTimers();
    syncStore.getState().adoptGeneration(1);
    syncStore.getState().setSignalVersion('org-1', 'channel.deleted', 5);

    await processAppCatchup({ ...signalsAnswer(5), generation: 2 });
    vi.useRealTimers();

    expect(channelDeleted).toHaveBeenCalledExactlyOnceWith({ type: 'channel.deleted', organizationId: 'org-1', subjectId: null }, { missed: true });
  });
});
