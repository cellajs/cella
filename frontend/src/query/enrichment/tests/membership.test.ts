import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeInfiniteData,
  makeMembership,
  mockAppConfig,
  mockComputeCan,
  mockGetEntityQueryKeys,
  mockGetRegisteredEntityTypes,
  mockHasEntityQueryKeys,
  mockHierarchy,
  mockPolicyMatrix,
  mockRegisterEntityQueryKeys,
  queryClient,
} from '~/query/enrichment/test-setup';

vi.mock('shared', () => ({
  appConfig: mockAppConfig,
  hierarchy: mockHierarchy,
  isChannel: mockHierarchy.isChannel,
  computeCan: mockComputeCan,
  policyMatrix: mockPolicyMatrix,
}));
vi.mock('~/query/query-client', () => ({ queryClient }));
vi.mock('~/modules/me/query', () => ({ meKeys: { memberships: ['me', 'memberships'] } }));
vi.mock('~/query/basic/entity-query-registry', () => ({
  getEntityQueryKeys: mockGetEntityQueryKeys,
  getRegisteredEntityTypes: mockGetRegisteredEntityTypes,
  hasEntityQueryKeys: mockHasEntityQueryKeys,
  registerEntityQueryKeys: mockRegisterEntityQueryKeys,
}));

const { initChannelEnrichment } = await import('~/query/enrichment/init-enrichment');

describe('membership enrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it('enriches entity list when memberships are already cached', () => {
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1'), makeMembership('org-2')],
    });

    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-2' }]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    for (const item of data.pages[0].items) {
      expect(item.membership).toBeDefined();
      expect(item.membership.organizationId).toBe(item.id);
    }
  });

  it('enriches all entity lists when memberships update', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' })],
    });

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership).toBeDefined();
    expect(data.pages[0].items[0].membership.role).toBe('admin');
  });

  it('updates membership when it changes', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member' })],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    const before = queryClient.getQueryData(['organization', 'list']) as any;
    expect(before.pages[0].items[0].membership.role).toBe('member');

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' })],
    });

    const after = queryClient.getQueryData(['organization', 'list']) as any;
    expect(after.pages[0].items[0].membership.role).toBe('admin');
  });

  it('preserves reference when nothing changed', () => {
    const membership = makeMembership('org-1');

    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], { items: [membership] });
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    const first = queryClient.getQueryData(['organization', 'list']);

    queryClient.setQueryData(['me', 'memberships'], { items: [membership] });

    const second = queryClient.getQueryData(['organization', 'list']);
    expect(second).toBe(first);
  });

  it('preserves direct membership when not in memberships cache', () => {
    unsubscribe = initChannelEnrichment();

    const membership = makeMembership('org-fallback', { role: 'guest' });

    queryClient.setQueryData(['me', 'memberships'], { items: [] });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-fallback', membership }]));

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('other-org')],
    });

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const item = data.pages[0].items[0];
    expect(item.membership).toBeDefined();
    expect(item.membership.role).toBe('guest');
  });

  it('does not enrich non-context-entity queries', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    queryClient.setQueryData(['attachment', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    const data = queryClient.getQueryData(['attachment', 'list']) as any;
    expect(data.pages[0].items[0].membership).toBeUndefined();
  });

  it('handles entities without matching membership gracefully', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-unknown' }]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership).toBeDefined();
    expect(data.pages[0].items[1].membership).toBeUndefined();
  });
});

describe('enrichment timing guarantee', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it('cache is enriched synchronously after setQueryData', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' }), makeMembership('org-2', { role: 'member' })],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-2' }]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const items = data.pages[0].items;

    expect(items).toHaveLength(2);
    expect(items[0].membership.role).toBe('admin');
    expect(items[1].membership.role).toBe('member');
  });

  it('getMenuData pattern: memberships first, then entities, then sync read', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-a'), makeMembership('org-b')],
    });

    queryClient.setQueryData(
      ['organization', 'list'],
      makeInfiniteData([{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-no-membership' }]),
    );

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const items = data.pages[0].items;

    expect(items[0].membership).toBeDefined();
    expect(items[0].membership.organizationId).toBe('org-a');

    expect(items[1].membership).toBeDefined();
    expect(items[1].membership.organizationId).toBe('org-b');

    expect(items[2].membership).toBeUndefined();

    const enrichedItems = items.filter((i: any) => !!i.membership);
    expect(enrichedItems).toHaveLength(2);
  });

  it('membership update re-enriches existing entity lists synchronously', () => {
    unsubscribe = initChannelEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member', archived: false })],
    });
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    let data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership.role).toBe('member');
    expect(data.pages[0].items[0].membership.archived).toBe(false);

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member', archived: true })],
    });

    data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership.archived).toBe(true);
  });
});
