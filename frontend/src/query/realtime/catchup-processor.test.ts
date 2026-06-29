import type { PostAppCatchupResponse } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    slug: 'test',
    contextEntityTypes: ['organization', 'project'],
    entityIdColumnKeys: { organization: 'organizationId', project: 'projectId' },
  },
  hierarchy: {
    getOrderedAncestors: (entityType: string) => {
      if (entityType === 'attachment') return ['project', 'organization'];
      return ['organization'];
    },
  },
}));

vi.mock('~/modules/common/blocknote/yjs-editor', () => ({
  useYjsEditorStore: {
    getState: () => ({
      isActive: () => false,
      getOwnedFields: () => [],
    }),
  },
}));

vi.mock('~/query/offline', () => ({
  sourceId: 'test-source',
}));

vi.mock('./membership-ops', () => ({
  invalidateContextList: vi.fn(),
  invalidateMemberQueries: vi.fn(),
  fetchMemberships: vi.fn(),
  refreshMe: vi.fn(),
}));

vi.mock('./sync-priority', () => ({
  getTenantIdForOrg: vi.fn(() => null),
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

    expect(deltaFetch).toHaveBeenCalledWith('org-1', 'tenant-1', '5', undefined);
    expect(useSyncStore.getState().getOrgSeq('org-1', 'attachment')).toBe(6);
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toMatchObject({ name: 'fresh' });
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({
      items: [{ id: 'attachment-1', organizationId: 'org-1', name: 'fresh' }],
      total: 1,
    });
  });

  it('invalidates org lists when child-context cached totals disagree with server counts', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys);

    const scopedListKey = keys.list.scope('org-1', 'project-1');
    queryClient.setQueryData(scopedListKey, {
      items: [
        { id: 'attachment-1', organizationId: 'org-1', projectId: 'project-1' },
        { id: 'attachment-2', organizationId: 'org-1', projectId: 'project-1' },
      ],
      total: 2,
    });

    await processAppCatchup({
      cursor: 'cursor-1',
      changes: {
        'org-1': {
          entityCounts: { attachment: 99 },
          childContextChanges: {
            'project-1': {
              entityCounts: { attachment: 3 },
            },
          },
        },
      },
    } as unknown as PostAppCatchupResponse);

    expect(queryClient.getQueryState(scopedListKey)?.isInvalidated).toBe(true);
  });
});
