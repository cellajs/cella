import '~/query/tests/query-client-env';
import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { isSyncDeliveryTrusted, setSyncDeliveryTrusted } from '~/query/basic/sync-stale-state';
import { syncStore } from '~/query/realtime/sync-store';

// Mock the boundaries: fetch/invalidate, tiers, propagation, unseen recount, router.
const fetchRangeAndPatch = vi.fn();
const invalidateEntityListForOrg = vi.fn();
vi.mock('./cache-ops', () => ({
  fetchRangeAndPatch: (...a: unknown[]) => fetchRangeAndPatch(...a),
  invalidateEntityListForOrg: (...a: unknown[]) => invalidateEntityListForOrg(...a),
}));
const getSyncTier = vi.fn();
vi.mock('./sync-priority', () => ({ getSyncTier: (...a: unknown[]) => getSyncTier(...a), isViewingChannel: () => false }));
const propagateEmbeddings = vi.fn();
vi.mock('./propagation', () => ({
  propagateEmbeddings: (...a: unknown[]) => propagateEmbeddings(...a),
}));
const invalidateUnseenCounts = vi.fn();
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: (...a: unknown[]) => invalidateUnseenCounts(...a) }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'test-client' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));
const resolveChannelPath = vi.fn((_channelType: string | null, _channelId: string): string | null => null);
vi.mock('./view-declaration', () => ({ resolveChannelPath: (...a: [string | null, string]) => resolveChannelPath(...a) }));

// Node test env has no document: stubbed before query-client loads, installListeners wires the promote-on-observe path.
vi.stubGlobal('document', { addEventListener: vi.fn(), hidden: false });

const { queryClient } = await import('~/query/query-client');
const { enqueueRange, flushAllNow, resetFetchPrioritizer } = await import('./fetch-prioritizer');
const { onSyncedRows } = await import('./sync-signals');

const background = { min: 2_000, max: 30_000 };
const viewing = { min: 0, max: 0 };
const onOpen = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };

const base = { entityType: 'attachment' as const, organizationId: 'org-1', tenantId: 'tenant-1', channelId: null, isCreate: false };

describe('fetch-prioritizer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    syncStore.getState().reset();
    setSyncDeliveryTrusted(true);
    // reachedSeq Infinity = full delivery (reaches any untilSeq) unless a test overrides it.
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [], reachedSeq: Number.POSITIVE_INFINITY });
    getSyncTier.mockReturnValue(background);
  });

  afterEach(() => {
    resetFetchPrioritizer();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('reads a range from the cursor catchup keeps and moves the cursor only past a range it delivered in full', async () => {
    // Catchup left the organization's cursor at 3; an org-homed row's notification names the organization as its channel.
    syncStore.getState().setOrgSeq('org-1', 'attachment', 3);

    // Seqs 4 and 5 were never notified, and the fetch delivers only up to 5 of the promised 7.
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [], reachedSeq: 5 });
    enqueueRange({ ...base, channelId: 'org-1', afterSeq: 5, untilSeq: 7 });
    await flushAllNow();

    expect(fetchRangeAndPatch.mock.calls[0][3]).toEqual({ afterSeq: 3, untilSeq: 7 });
    // A short delivery holds the cursor, refetches the lists and stops trusting sync until a clean catchup.
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(3);
    expect(invalidateEntityListForOrg).toHaveBeenCalledOnce();
    expect(isSyncDeliveryTrusted()).toBe(false);

    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [], reachedSeq: 7 });
    enqueueRange({ ...base, channelId: 'org-1', afterSeq: 6, untilSeq: 7 });
    await flushAllNow();

    expect(fetchRangeAndPatch.mock.calls[1][3]).toEqual({ afterSeq: 3, untilSeq: 7 });
    expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(7);
  });

  it.each(['overflow', 'error'] as const)(
    'ends a range whose fetch reports %s in one list invalidation, an empty degraded batch and a cursor moved on',
    async (status) => {
      const syncedRows = vi.fn();
      const off = onSyncedRows(syncedRows);
      fetchRangeAndPatch.mockResolvedValue({ status, items: [] });
      enqueueRange({ ...base, afterSeq: 0, untilSeq: 9, isCreate: true });

      // One attempt per flush: a failing fetch is retried before it falls back, so the range cannot loop.
      for (let attempt = 0; attempt < 3; attempt++) await flushAllNow();
      off();

      expect(invalidateEntityListForOrg).toHaveBeenCalledOnce();
      expect(syncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
      expect(syncedRows).toHaveBeenCalledExactlyOnceWith({ entityType: 'attachment', organizationId: 'org-1', rows: [], degraded: true });
      expect(invalidateUnseenCounts).toHaveBeenCalledOnce();
    },
  );

  it('publishes fetched rows once per merged flush (no endpoint recount)', async () => {
    const syncedRows = vi.fn();
    const off = onSyncedRows(syncedRows);
    const items = [{ id: 'a1' }, { id: 'a2' }];
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items });
    enqueueRange({ ...base, afterSeq: 4, untilSeq: 6, isCreate: true });
    enqueueRange({ ...base, afterSeq: 6, untilSeq: 9, isCreate: true });

    await flushAllNow();
    off();

    expect(syncedRows).toHaveBeenCalledTimes(1);
    expect(syncedRows).toHaveBeenCalledWith({ entityType: 'attachment', organizationId: 'org-1', rows: items, degraded: false });
    expect(invalidateUnseenCounts).not.toHaveBeenCalled();
  });

  it('fires collected propagation hints after the flush', async () => {
    const hint = { embeddedProduct: 'label', hostProduct: 'task', hostColumn: 'labels', update: ['l1'], remove: [] };
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
    resolveChannelPath.mockImplementation((_type, channelId) => knownPaths[channelId] ?? null);

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
