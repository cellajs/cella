import '~/query/tests/query-client-env';
import { QueryObserver, queryOptions } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '~/lib/api';
import { recordReportedBudgets } from '~/lib/reported-budgets';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { syncStore } from '~/query/realtime/sync-store';

// Mock the boundaries: fetch/invalidate, tiers, propagation, unseen recount, router.
const fetchRangeAndPatch = vi.fn();
const invalidateEntityListForOrg = vi.fn();
vi.mock('~/query/realtime/cache-ops', () => ({
  fetchRangeAndPatch: (...a: unknown[]) => fetchRangeAndPatch(...a),
  invalidateEntityListForOrg: (...a: unknown[]) => invalidateEntityListForOrg(...a),
}));
const getSyncTier = vi.fn();
vi.mock('~/query/realtime/sync-priority', () => ({ getSyncTier: (...a: unknown[]) => getSyncTier(...a), isViewingChannel: () => false }));
const propagateEmbeddings = vi.fn();
vi.mock('~/query/realtime/propagation', () => ({
  propagateEmbeddings: (...a: unknown[]) => propagateEmbeddings(...a),
}));
const invalidateUnseenCounts = vi.fn();
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: (...a: unknown[]) => invalidateUnseenCounts(...a) }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'test-client' }));
vi.mock('~/routes/-router-instance', () => ({ getRouter: () => ({ subscribe: vi.fn(), state: { matches: [] } }) }));
const resolveChannelPath = vi.fn((_channelId: string): string | null => null);
vi.mock('~/query/realtime/view-declaration', () => ({ resolveChannelPath: (channelId: string) => resolveChannelPath(channelId) }));

// Node test env has no document: stubbed before query-client loads, installListeners wires the promote-on-observe path.
const documentListeners = new Map<string, () => void>();
vi.stubGlobal('document', { addEventListener: (type: string, listener: () => void) => documentListeners.set(type, listener), hidden: false });

const { queryClient } = await import('~/query/query-client');
const { enqueueRange, flushAllNow, resetFetchPrioritizer } = await import('~/query/realtime/fetch-prioritizer');
const { onSyncedRows } = await import('~/query/realtime/sync-events');
const { syncedListOptions } = await import('~/query/basic/synced-list-options');

const background = { min: 2_000, max: 30_000 };
const viewing = { min: 0, max: 0 };
const onOpen = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };

const base = { productType: 'attachment' as const, organizationId: 'org-1', tenantId: 'tenant-1', channelId: null, hasCreates: false };
const cursor = () => syncStore.getState().getOrgSeq('org-1', 'attachment');

/** What the API client books when the read budget refuses a GET. */
const refuseReads = (seconds: number) =>
  recordReportedBudgets('GET', new Response(null, { status: 429, headers: { 'Retry-After': String(seconds) } }));

describe('fetch-prioritizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    syncStore.getState().reset();
    // reachedSeq Infinity = full delivery (reaches any untilSeq) unless a test overrides it.
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [], reachedSeq: Number.POSITIVE_INFINITY });
    getSyncTier.mockReturnValue(background);
  });

  afterEach(() => {
    resetFetchPrioritizer();
    vi.clearAllMocks();
    // The read budget is module state: the next test starts with it unspent.
    recordReportedBudgets('GET', new Response(null, { headers: { RateLimit: '"read";r=1000;t=300', 'RateLimit-Policy': '"read";q=1000;w=300' } }));
    vi.useRealTimers();
  });

  it('reads a range from the cursor catchup keeps and settles one that came back short as one it could not fetch: rows patched, lists marked, cursor moved on', async () => {
    const syncedRows = vi.fn();
    const off = onSyncedRows(syncedRows);
    // Catchup left the organization's cursor at 3; an org-homed row's notification names the organization as its channel.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 3);

    // Seqs 4 and 5 were never notified, and the fetch delivers only up to 5 of the promised 7: the row at 7 changed again since.
    const items = [{ id: 'a5' }];
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items, reachedSeq: 5 });
    enqueueRange({ ...base, channelId: 'org-1', afterSeq: 5, untilSeq: 7 });
    await flushAllNow();
    off();

    expect(fetchRangeAndPatch.mock.calls[0][3]).toEqual({ afterSeq: 3, untilSeq: 7 });
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(7);
    expect(invalidateEntityListForOrg).toHaveBeenCalledOnce();
    expect(syncedRows).toHaveBeenCalledExactlyOnceWith({ productType: 'attachment', organizationId: 'org-1', rows: items });

    // The row's next change names its new position, and its range starts where the cursor moved to.
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [], reachedSeq: 9 });
    enqueueRange({ ...base, channelId: 'org-1', afterSeq: 8, untilSeq: 9 });
    await flushAllNow();

    expect(fetchRangeAndPatch.mock.calls[1][3]).toEqual({ afterSeq: 7, untilSeq: 9 });
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
    expect(invalidateEntityListForOrg).toHaveBeenCalledOnce();
  });

  it('reads a channel without a cursor of its own from the organization cursor catchup moved', async () => {
    syncStore.getState().setOrgSeq('org-1', 'attachment', 5);

    enqueueRange({ ...base, channelId: 'project-9', afterSeq: 2, untilSeq: 7 });
    await flushAllNow();

    expect(fetchRangeAndPatch.mock.calls[0][3]).toEqual({ afterSeq: 5, untilSeq: 7 });
    expect(syncStore.getState().getChannelSeq('org-1', 'project-9', 'attachment')).toBe(7);
  });

  it.each(['overflow', 'error'] as const)(
    'ends a range whose fetch reports %s in one list invalidation, one unseen recount and a cursor moved on, and publishes no rows',
    async (status) => {
      const syncedRows = vi.fn();
      const off = onSyncedRows(syncedRows);
      fetchRangeAndPatch.mockResolvedValue({ status, items: [] });
      enqueueRange({ ...base, afterSeq: 0, untilSeq: 9, hasCreates: true });

      // One attempt per flush: a failing fetch is retried before it falls back, so the range cannot loop.
      for (let attempt = 0; attempt < 3; attempt++) await flushAllNow();
      off();

      expect(invalidateEntityListForOrg).toHaveBeenCalledOnce();
      expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
      expect(syncedRows).not.toHaveBeenCalled();
      expect(invalidateUnseenCounts).toHaveBeenCalledOnce();
    },
  );

  it('holds every range read while the read budget is spent, keeps the cursor and marks no list, then reads the held ranges once and refetches the list on screen it refused', async () => {
    getSyncTier.mockReturnValue(viewing);
    syncStore.getState().setOrgSeq('org-1', 'attachment', 3);
    const listRead = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 429 }))
      .mockResolvedValue({ results: [], totalSize: 0 });
    const observer = new QueryObserver(queryClient, { queryKey: ['attachment', 'list', 'org-1'], queryFn: listRead, retry: false });
    const unsubscribe = observer.subscribe(() => {});

    // Three refusals of 20 s each: a refusal is no failed attempt, so none moves the cursor or marks a list.
    fetchRangeAndPatch.mockImplementation(async () => {
      if (fetchRangeAndPatch.mock.calls.length > 3) return { status: 'ok', items: [], reachedSeq: 7 };
      refuseReads(20);
      return { status: 'limited', items: [], reachedSeq: 0 };
    });
    enqueueRange({ ...base, afterSeq: 3, untilSeq: 5 });
    await vi.advanceTimersByTimeAsync(0);
    enqueueRange({ ...base, afterSeq: 5, untilSeq: 7 });
    await vi.advanceTimersByTimeAsync(19_999);

    expect(fetchRangeAndPatch).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(3);
    expect(cursor()).toBe(3);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(4);
    expect(fetchRangeAndPatch.mock.calls[3][3]).toEqual({ afterSeq: 3, untilSeq: 7 });
    expect(cursor()).toBe(7);
    expect(invalidateEntityListForOrg).not.toHaveBeenCalled();
    expect(listRead).toHaveBeenCalledTimes(2);

    unsubscribe();
    queryClient.clear();
  });

  // A list read the budget refused while no range read waited stayed failed until it was opened again.
  it('reads a list on screen again once the read budget has reads left, when the budget refused only that read', async () => {
    const listRead = vi
      .fn()
      .mockImplementationOnce(async () => {
        refuseReads(20);
        throw new ApiError({ status: 429 });
      })
      .mockResolvedValue({ results: [], totalSize: 0 });
    const list = syncedListOptions(queryOptions({ queryKey: ['attachment', 'list', 'org-1'], queryFn: listRead }));
    const unsubscribe = new QueryObserver(queryClient, { ...list, retry: false }).subscribe(() => {});

    await vi.advanceTimersByTimeAsync(19_999);
    expect(listRead).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1);
    expect(listRead).toHaveBeenCalledTimes(2);

    unsubscribe();
    queryClient.clear();
  });

  it('keeps one range read in flight per product type and organization: changes announced during it join one read from the cursor it moved to', async () => {
    getSyncTier.mockReturnValue(viewing);
    syncStore.getState().setOrgSeq('org-1', 'attachment', 3);
    fetchRangeAndPatch.mockImplementation(async (_type, _organizationId, _tenantId, range: { untilSeq: number }) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return { status: 'ok', items: [], reachedSeq: range.untilSeq };
    });

    enqueueRange({ ...base, afterSeq: 3, untilSeq: 4 });
    await vi.advanceTimersByTimeAsync(30);
    enqueueRange({ ...base, afterSeq: 4, untilSeq: 5 });
    await vi.advanceTimersByTimeAsync(30);
    enqueueRange({ ...base, afterSeq: 5, untilSeq: 6 });
    await vi.advanceTimersByTimeAsync(300);

    expect(fetchRangeAndPatch.mock.calls.map((call) => call[3])).toEqual([
      { afterSeq: 3, untilSeq: 4 },
      { afterSeq: 4, untilSeq: 6 },
    ]);
    expect(cursor()).toBe(6);
  });

  it('reads a viewed scope of a hidden tab on the background tier, and at once when the tab is shown', async () => {
    // A hidden tab gives its viewed scopes the background tier.
    enqueueRange({ ...base, afterSeq: 3, untilSeq: 5 });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchRangeAndPatch).not.toHaveBeenCalled();

    getSyncTier.mockReturnValue(viewing);
    documentListeners.get('visibilitychange')?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchRangeAndPatch).toHaveBeenCalledOnce();
  });

  it('publishes fetched rows once per merged flush (no endpoint recount)', async () => {
    const syncedRows = vi.fn();
    const off = onSyncedRows(syncedRows);
    const items = [{ id: 'a1' }, { id: 'a2' }];
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items });
    enqueueRange({ ...base, afterSeq: 4, untilSeq: 6, hasCreates: true });
    enqueueRange({ ...base, afterSeq: 6, untilSeq: 9, hasCreates: true });

    await flushAllNow();
    off();

    expect(syncedRows).toHaveBeenCalledTimes(1);
    expect(syncedRows).toHaveBeenCalledWith({ productType: 'attachment', organizationId: 'org-1', rows: items });
    expect(invalidateUnseenCounts).not.toHaveBeenCalled();
  });

  it('fires collected propagation hints after the flush', async () => {
    const hint = { embeddedProductType: 'label', update: ['l1'], remove: [] };
    enqueueRange({ ...base, afterSeq: 4, untilSeq: 6, propagation: hint as never });

    await flushAllNow();

    expect(propagateEmbeddings).toHaveBeenCalledWith(hint);
  });

  it('skips ranges the client already has (untilSeq <= caught-up)', async () => {
    syncStore.getState().setOrgSeq('org-1', 'attachment', 10);
    enqueueRange({ ...base, afterSeq: 7, untilSeq: 10 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchRangeAndPatch).not.toHaveBeenCalled();
  });

  it('narrows a covering fetch no further than the channel every due channel lies under', async () => {
    const knownPaths: Record<string, string> = { 'proj-a': 'org-1/course-1/proj-a', 'proj-b': 'org-1/course-1/proj-b' };
    resolveChannelPath.mockImplementation((channelId) => knownPaths[channelId] ?? null);

    enqueueRange({ ...base, channelId: 'proj-a', afterSeq: 4, untilSeq: 8 });
    enqueueRange({ ...base, channelId: 'proj-b', afterSeq: 8, untilSeq: 12 });
    await flushAllNow();
    // Both projects lie under the course: one read of its subtree covers them.
    expect(fetchRangeAndPatch.mock.calls[0][5]).toBe('course-1');

    enqueueRange({ ...base, channelId: 'proj-a', afterSeq: 12, untilSeq: 14 });
    enqueueRange({ ...base, channelId: 'proj-c', afterSeq: 14, untilSeq: 16 });
    await flushAllNow();
    // A channel whose path is not cached leaves the read on the whole organization.
    expect(fetchRangeAndPatch.mock.calls[1][5]).toBeUndefined();
  });

  it('flushes a pending channel view when its channel gains an observer (catch-up-on-open without navigation)', async () => {
    enqueueRange({ ...base, afterSeq: 4, untilSeq: 8 }); // background tier: waits for the spread slot
    expect(fetchRangeAndPatch).not.toHaveBeenCalled();

    // The channel view's view mounts: its list query gains an observer and the tier turns live.
    getSyncTier.mockReturnValue(viewing);
    const observer = new QueryObserver(queryClient, { queryKey: ['attachment', 'list', 'org-1'], queryFn: async () => [] });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(fetchRangeAndPatch.mock.calls[0][3]).toEqual({ afterSeq: 4, untilSeq: 8 });

    unsubscribe();
    queryClient.clear();
  });

  it('holds the changes of a muted channel view until it is opened, then fetches them', async () => {
    getSyncTier.mockReturnValue(onOpen);
    enqueueRange({ ...base, channelId: 'project-9', afterSeq: 3, untilSeq: 7 });
    // No timer either: a browser runs a timeout past 2^31-1 ms at once, and would spin.
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(60_000);
    // A hidden tab tops up every scope but this one.
    await flushAllNow();
    expect(fetchRangeAndPatch).not.toHaveBeenCalled();

    // The channel is opened: its list query gains an observer and the tier turns live.
    getSyncTier.mockReturnValue(viewing);
    const observer = new QueryObserver(queryClient, { queryKey: ['attachment', 'list', 'org-1', 'project-9'], queryFn: async () => [] });
    const unsubscribe = observer.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(fetchRangeAndPatch.mock.calls[0][3]).toEqual({ afterSeq: 3, untilSeq: 7 });
    expect(syncStore.getState().getChannelSeq('org-1', 'project-9', 'attachment')).toBe(7);

    unsubscribe();
    queryClient.clear();
  });
});
