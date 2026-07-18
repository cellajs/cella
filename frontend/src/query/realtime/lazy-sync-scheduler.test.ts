import { QueryObserver } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { useSyncStore } from '~/query/realtime/sync-store';

// Mock the boundaries: fetch/invalidate, tiers, propagation, unseen recount, router.
const fetchRangeAndPatch = vi.fn();
const invalidateEntityListForOrg = vi.fn();
vi.mock('./cache-ops', () => ({
  fetchRangeAndPatch: (...a: unknown[]) => fetchRangeAndPatch(...a),
  invalidateEntityListForOrg: (...a: unknown[]) => invalidateEntityListForOrg(...a),
}));
const getSyncTier = vi.fn();
vi.mock('./sync-priority', () => ({
  getSyncTier: (...a: unknown[]) => getSyncTier(...a),
  isViewingChannel: () => false,
}));
const propagateEmbeddings = vi.fn();
vi.mock('./propagation', () => ({ propagateEmbeddings: (...a: unknown[]) => propagateEmbeddings(...a) }));
const invalidateUnseenCounts = vi.fn();
vi.mock('~/modules/seen/query', () => ({ invalidateUnseenCounts: (...a: unknown[]) => invalidateUnseenCounts(...a) }));
const ingestSyncedRows = vi.fn();
vi.mock('~/modules/seen/unseen-sync', () => ({ ingestSyncedRows: (...a: unknown[]) => ingestSyncedRows(...a) }));
vi.mock('~/query/offline/stx-utils', () => ({ sourceId: 'test-client' }));
vi.mock('~/routes/router', () => ({ router: { subscribe: vi.fn(), state: { matches: [] } } }));

// Node test env has no document/window; stub them (before importing query-client, which attaches
// online listeners at load) so installListeners wires the promote-on-observe path.
vi.stubGlobal('document', { addEventListener: vi.fn(), hidden: false });
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
vi.stubGlobal('navigator', { onLine: true });

const { queryClient } = await import('~/query/query-client');
const { enqueueRange, flushAllNow, resetLazySync } = await import('./lazy-sync-scheduler');

const BACKGROUND = { min: 2_000, max: 30_000 };
const VIEWING = { min: 0, max: 0 };
const ON_OPEN = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };

const base = {
  entityType: 'attachment' as const,
  organizationId: 'org-1',
  tenantId: 'tenant-1',
  channelId: null,
  isCreate: false,
};

describe('lazy-sync-scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    registerEntityQueryKeys('attachment', createEntityKeys('attachment'));
    useSyncStore.getState().reset();
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items: [] });
    getSyncTier.mockReturnValue(BACKGROUND);
  });

  afterEach(() => {
    resetLazySync();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('merges notifications in the window into ONE fetch and advances the caught-up seq after success', async () => {
    enqueueRange({ ...base, fromSeq: 5, untilSeq: 8 });
    enqueueRange({ ...base, fromSeq: 9, untilSeq: 12 });
    expect(fetchRangeAndPatch).not.toHaveBeenCalled(); // background tier: nothing yet

    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(fetchRangeAndPatch.mock.calls[0][3]).toBe('5,12'); // merged range
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(12);
  });

  it('flushes viewing-tier channel views immediately (single events keep live behavior)', async () => {
    getSyncTier.mockReturnValue(VIEWING);
    enqueueRange({ ...base, fromSeq: 3, untilSeq: 3 });

    await vi.advanceTimersByTimeAsync(0);

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(fetchRangeAndPatch.mock.calls[0][3]).toBe('3,3');
  });

  it('records the known seq but never fetches for muted channel views', async () => {
    getSyncTier.mockReturnValue(ON_OPEN);
    enqueueRange({ ...base, channelId: 'project-9', fromSeq: 4, untilSeq: 7 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchRangeAndPatch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getKnownSeq('project-9', 'attachment')).toBe(7);
  });

  it('self-heals a small live gap by anchoring at caught-up+1', async () => {
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    enqueueRange({ ...base, fromSeq: 6, untilSeq: 8 }); // seq 5 was missed

    await flushAllNow();

    expect(fetchRangeAndPatch.mock.calls[0][3]).toBe('5,8');
  });

  it('org-homed channel views (wire channelId === orgId) share ONE watermark slot with catchup', async () => {
    // Catchup advanced the org slot; the live notification carries channelId = orgId.
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 6);
    enqueueRange({ ...base, channelId: 'org-1', fromSeq: 3, untilSeq: 9 });

    await flushAllNow();

    // Anchors at the org slot (7,9) and advances that same slot after success.
    expect(fetchRangeAndPatch.mock.calls[0][3]).toBe('7,9');
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
    expect(useSyncStore.getState().getChannelSeq('org-1', 'org-1', 'attachment')).toBe(9);
  });

  it('retries transient errors with backoff, then invalidates and advances so the range cannot loop', async () => {
    fetchRangeAndPatch.mockResolvedValue({ status: 'error', items: [] });
    enqueueRange({ ...base, fromSeq: 2, untilSeq: 2 });

    await vi.advanceTimersByTimeAsync(30_000); // first attempt
    await vi.advanceTimersByTimeAsync(2_000); // retry 1
    await vi.advanceTimersByTimeAsync(4_000); // retry 2 → exhausted → fallback

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(3);
    expect(invalidateEntityListForOrg).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(2);
  });

  it('invalidates immediately on overflow (no retries)', async () => {
    fetchRangeAndPatch.mockResolvedValue({ status: 'overflow', items: [] });
    enqueueRange({ ...base, fromSeq: 1, untilSeq: 900 });

    await flushAllNow();

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(invalidateEntityListForOrg).toHaveBeenCalledTimes(1);
  });

  it('feeds fetched rows to unseen-sync once per merged flush (no endpoint recount)', async () => {
    const items = [{ id: 'a1' }, { id: 'a2' }];
    fetchRangeAndPatch.mockResolvedValue({ status: 'ok', items });
    enqueueRange({ ...base, fromSeq: 5, untilSeq: 6, isCreate: true });
    enqueueRange({ ...base, fromSeq: 7, untilSeq: 9, isCreate: true });

    await flushAllNow();

    expect(ingestSyncedRows).toHaveBeenCalledTimes(1);
    expect(ingestSyncedRows).toHaveBeenCalledWith('attachment', 'org-1', items);
    expect(invalidateUnseenCounts).not.toHaveBeenCalled();
  });

  it('falls back to an exact unseen recount when the flush cannot deliver rows', async () => {
    fetchRangeAndPatch.mockResolvedValue({ status: 'overflow', items: [] });
    enqueueRange({ ...base, fromSeq: 1, untilSeq: 900, isCreate: true });

    await flushAllNow();

    expect(ingestSyncedRows).not.toHaveBeenCalled();
    expect(invalidateUnseenCounts).toHaveBeenCalledTimes(1);
  });

  it('fires collected propagation hints after the flush', async () => {
    const hint = { sourceType: 'label', targetType: 'task', field: 'labels', update: ['l1'], remove: [] };
    enqueueRange({ ...base, fromSeq: 5, untilSeq: 6, propagation: hint as never });

    await flushAllNow();

    expect(propagateEmbeddings).toHaveBeenCalledWith(hint);
  });

  it('skips ranges the client already has (untilSeq <= caught-up)', async () => {
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 10);
    enqueueRange({ ...base, fromSeq: 8, untilSeq: 10 });

    await vi.advanceTimersByTimeAsync(60_000);

    expect(fetchRangeAndPatch).not.toHaveBeenCalled();
  });

  it('flushes a pending channel view when its channel gains an observer (catch-up-on-open without navigation)', async () => {
    enqueueRange({ ...base, fromSeq: 5, untilSeq: 8 }); // background tier: waits for the spread slot
    expect(fetchRangeAndPatch).not.toHaveBeenCalled();

    // The channel view's view mounts: its list query gains an observer and the tier turns live.
    getSyncTier.mockReturnValue(VIEWING);
    const observer = new QueryObserver(queryClient, {
      queryKey: ['attachment', 'list', 'org-1'],
      queryFn: async () => [],
    });
    const unsubscribe = observer.subscribe(() => {});

    await vi.advanceTimersByTimeAsync(0);

    expect(fetchRangeAndPatch).toHaveBeenCalledTimes(1);
    expect(fetchRangeAndPatch.mock.calls[0][3]).toBe('5,8');

    unsubscribe();
    queryClient.clear();
  });
});
