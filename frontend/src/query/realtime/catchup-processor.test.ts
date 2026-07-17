import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    slug: 'test',
    channelEntityTypes: ['organization', 'project'],
    entityIdColumnKeys: { organization: 'organizationId', project: 'projectId' },
    seenTrackedEntityTypes: [],
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
  // Viewing tier by default: catchup reconciles inline, preserving the original test behavior.
  getSyncTier: vi.fn(() => ({ min: 0, max: 0 })),
}));

const enqueueCatchupRange = vi.fn();
vi.mock('./lazy-sync-scheduler', () => ({
  resetLazySync: vi.fn(),
  enqueueCatchupRange: (...a: unknown[]) => enqueueCatchupRange(...a),
}));

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
const { processAppCatchup } = await import('./catchup-processor');

describe('catchup processor', () => {
  afterEach(() => {
    queryClient.clear();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('uses the pre-catchup org seq for org-level delta fetches', async () => {
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

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {
        'org-1': {
          entitySeqs: { attachment: 6 },
          entityCounts: { attachment: 1 },
        },
      },
    } as unknown as PostAppCatchupResponse);

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5');
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toMatchObject({ name: 'fresh' });
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    });
  });

  it('never advances the org cursor silently: a failed delta fetch invalidates before advancing', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: { 'org-1': { entitySeqs: { attachment: 6 } } },
    } as unknown as PostAppCatchupResponse);

    expect(deltaFetch).toHaveBeenCalled();
    // The failed window is handed to react-query via invalidation...
    expect(queryClient.getQueryState(keys.list.org('org-1'))?.isInvalidated).toBe(true);
    // ...and only alongside that does the cursor advance, never past a silently skipped window.
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
  });

  it('skips the delta fetch for scopes with nothing cached (scope-symmetry guard)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    // Durable cursor survives from a wiped session cache; nothing is cached for this org.
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: { 'org-1': { entitySeqs: { attachment: 6 } } },
    } as unknown as PostAppCatchupResponse);

    // Nothing to patch -> no fetch; hydration re-establishes the cursor when the scope mounts
    expect(deltaFetch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
  });

  it('context-level deltas advance the context cursor after the fetch resolves', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({
      items: [{ id: 'attachment-1', organizationId: 'org-1', projectId: 'project-1', seq: 8, name: 'fresh' }],
      total: 1,
    }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setChannelSeq('org-1', 'project-1', 'attachment', 5);
    queryClient.setQueryData(keys.list.home('org-1', 'project-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1', projectId: 'project-1', seq: 5, name: 'stale' }],
      total: 1,
    });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {
        'org-1': {
          entitySeqs: { attachment: 8 },
          childChannelChanges: { 'project-1': { entitySeqs: { attachment: 8 } } },
        },
      },
    } as unknown as PostAppCatchupResponse);

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '6');
    expect(useSyncStore.getState().getChannelSeq('org-1', 'project-1', 'attachment')).toBe(8);
    // Org-level screening seq also advances for context-handled types
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(8);
    expect(queryClient.getQueryData(keys.list.home('org-1', 'project-1'))).toMatchObject({
      items: [{ name: 'fresh' }],
    });
  });

  it('invalidates org lists when a server count CHANGES between catchups (never vs cached totals)', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys);

    const scopedListKey = keys.list.home('org-1', 'project-1');
    // Cached total deliberately disagrees with the server count: caches are
    // predicate-filtered per user, so equality with shared counts means nothing
    queryClient.setQueryData(scopedListKey, {
      items: [
        { id: 'attachment-1', organizationId: 'org-1', projectId: 'project-1' },
        { id: 'attachment-2', organizationId: 'org-1', projectId: 'project-1' },
      ],
      total: 2,
    });

    const catchup = (count: number) =>
      processAppCatchup({
        cursor: 'cursor-1',
        changes: {
          'org-1': {
            childChannelChanges: {
              'project-1': {
                entityCounts: { attachment: count },
              },
            },
          },
        },
      } as unknown as PostAppCatchupResponse);

    // First sight: nothing to compare against, no invalidation despite the "mismatch"
    await catchup(3);
    expect(queryClient.getQueryState(scopedListKey)?.isInvalidated).toBe(false);

    // Unchanged count: still no signal
    await catchup(3);
    expect(queryClient.getQueryState(scopedListKey)?.isInvalidated).toBe(false);

    // Count changed while this client wasn't watching → invalidate
    await catchup(4);
    expect(queryClient.getQueryState(scopedListKey)?.isInvalidated).toBe(true);
  });
});

describe('catchup → scheduler fold (N-d)', () => {
  afterEach(() => {
    queryClient.clear();
    useSyncStore.getState().reset();
    vi.clearAllMocks();
  });

  it('enqueues background scopes lazily and does NOT advance their caught-up seq inline', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 2_000, max: 30_000 }); // background

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: { 'org-1': { entitySeqs: { attachment: 9 } } },
    } as unknown as PostAppCatchupResponse);

    // Handed to the scheduler with the bounded gap; no inline fetch, no inline advance.
    expect(enqueueCatchupRange).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'attachment', organizationId: 'org-1', fromSeq: 5, untilSeq: 9 }),
    );
    expect(deltaFetch).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(4);
  });

  it('still reconciles viewing scopes inline (mutation-replay gate)', async () => {
    const { getSyncTier } = await import('./sync-priority');
    vi.mocked(getSyncTier).mockReturnValue({ min: 0, max: 0 }); // viewing

    const keys = createEntityKeys<Record<string, never>>('attachment');
    const deltaFetch = vi.fn(async () => ({ items: [], total: 0 }));
    registerEntityQueryKeys('attachment', keys, deltaFetch);

    useSyncStore.getState().setOrgTenantId('org-1', 'tenant-1');
    useSyncStore.getState().setOrgSeq('org-1', 'attachment', 4);
    queryClient.setQueryData(keys.list.org('org-1'), { items: [], total: 0 });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: { 'org-1': { entitySeqs: { attachment: 9 } } },
    } as unknown as PostAppCatchupResponse);

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5');
    expect(enqueueCatchupRange).not.toHaveBeenCalled();
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(9);
  });
});
