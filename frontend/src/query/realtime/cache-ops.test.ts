import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('shared', () => ({
  appConfig: {
    channelEntityTypes: ['organization'],
    entityIdColumnKeys: { organization: 'organizationId' },
  },
  hierarchy: {
    getOrderedAncestors: () => ['organization'],
  },
}));

vi.mock('~/modules/common/blocknote/yjs-editor', () => ({
  isYjsEditorActive: () => false,
  getYjsOwnedFields: () => [],
}));

vi.mock('~/query/offline', () => ({
  sourceId: 'test-source',
}));

vi.stubGlobal('window', {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});
vi.stubGlobal('navigator', { onLine: true });

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { fetchRangeAndPatch } = await import('./cache-ops');

describe('realtime cache ops', () => {
  afterEach(() => {
    queryClient.clear();
  });

  it('removes tombstone rows returned by seq range fetch', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => ({
      items: [
        {
          id: 'attachment-1',
          organizationId: 'org-1',
          deletedAt: '2026-06-16T20:00:00.000Z',
        },
      ],
      total: 1,
    }));

    queryClient.setQueryData(keys.detail.byId('attachment-1'), { id: 'attachment-1', organizationId: 'org-1' });
    queryClient.setQueryData(keys.list.org('org-1'), {
      items: [{ id: 'attachment-1', organizationId: 'org-1' }],
      total: 1,
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '4,4', keys);

    expect(status).toBe('ok');
    expect(queryClient.getQueryData(keys.detail.byId('attachment-1'))).toBeUndefined();
    expect(queryClient.getQueryData(keys.list.org('org-1'))).toEqual({ items: [], total: 0 });
  });

  it('reports overflow when the seq window overflows one response — no silent 1000-row delta cap', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    // A full SYNC_CHUNK_SIZE response means more changes may remain beyond this window
    const items = Array.from({ length: 1000 }, (_, i) => ({
      id: `att-${i + 1}`,
      organizationId: 'org-1',
      seq: i + 1,
    }));
    registerEntityQueryKeys('attachment', keys, async () => ({ items, total: 1500 }));

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '1', keys);

    // Patching a truncated window would drop the remainder; caller must invalidate instead.
    expect(status).toBe('overflow');
    expect(queryClient.getQueryData(keys.detail.byId('att-1'))).toBeUndefined();
  });

  it('reports a transient error on a rejected delta fetch so callers may retry or invalidate', async () => {
    const keys = createEntityKeys<Record<string, never>>('attachment');
    registerEntityQueryKeys('attachment', keys, async () => {
      throw new Error('network down');
    });

    const { status } = await fetchRangeAndPatch('attachment', 'org-1', 'tenant-1', '5', keys);

    expect(status).toBe('error');
  });
});
