import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so vi.mock factory (which is hoisted) can reference these values
const { mockAppConfig, mockHierarchy, mockComputeCan, mockAccessPolicies } = vi.hoisted(() => {
  // Minimal hierarchy mock that implements the methods used by enrichment
  const parentMap: Record<string, string | null> = {
    organization: null,
    project: 'organization',
  };

  const childrenMap: Record<string, string[]> = {
    organization: ['project'],
    project: [],
  };

  const entityActions = ['create', 'read', 'update', 'delete', 'search'] as string[];

  const mockHierarchy = {
    getOrderedAncestors(entityType: string): string[] {
      const ancestors: string[] = [];
      let current = parentMap[entityType] ?? null;
      while (current !== null) {
        ancestors.push(current);
        current = parentMap[current] ?? null;
      }
      return ancestors;
    },
    hasAncestor(entityType: string, ancestor: string): boolean {
      return this.getOrderedAncestors(entityType).includes(ancestor);
    },
    getOrderedDescendants(contextType: string): string[] {
      const descendants: string[] = [];
      const queue = [...(childrenMap[contextType] ?? [])];
      let i = 0;
      while (i < queue.length) {
        const current = queue[i++];
        descendants.push(current);
        queue.push(...(childrenMap[current] ?? []));
      }
      return descendants;
    },
  };

  const mockComputeCan = (contextType: string) => {
    const denied = Object.fromEntries(entityActions.map((a) => [a, false]));
    const map: Record<string, Record<string, boolean>> = { [contextType]: { ...denied } };
    for (const d of mockHierarchy.getOrderedDescendants(contextType)) {
      map[d] = { ...denied };
    }
    return map;
  };

  return {
    mockAppConfig: {
      contextEntityTypes: ['organization', 'project'] as string[],
      entityIdColumnKeys: { organization: 'organizationId', project: 'projectId' } as Record<string, string>,
      entityActions,
    },
    mockHierarchy,
    mockComputeCan,
    mockAccessPolicies: {},
  };
});

vi.mock('shared', () => ({
  appConfig: mockAppConfig,
  hierarchy: mockHierarchy,
  isContextEntity: (type: string) => mockAppConfig.contextEntityTypes.includes(type),
  computeCan: mockComputeCan,
  accessPolicies: mockAccessPolicies,
}));

// We mock queryClient and meKeys to be controlled from tests
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 } },
});

vi.mock('~/query/query-client', () => ({ queryClient }));
vi.mock('~/modules/me/query', () => ({ meKeys: { memberships: ['me', 'memberships'] } }));

// Now import the module under test — mocks must be set up first
const { initContextEntityEnrichment } = await import('~/query/enrichment/init');

// --- Test helpers ---

interface TestMembership {
  organizationId: string;
  contextType: string;
  archived: boolean;
  muted: boolean;
  displayOrder: number;
  role: string;
  [key: string]: unknown;
}

function makeMembership(entityId: string, overrides?: Partial<TestMembership>): TestMembership {
  return {
    organizationId: entityId,
    contextType: 'organization',
    archived: false,
    muted: false,
    displayOrder: 0,
    role: 'member',
    ...overrides,
  };
}

function makeInfiniteData(items: { id: string; membership?: TestMembership | null }[]) {
  return { pages: [{ items }], pageParams: [undefined] };
}

// --- Tests ---

describe('initContextEntityEnrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it('enriches entity list when memberships are already cached', () => {
    // 1. Populate memberships cache
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1'), makeMembership('org-2')],
    });

    // 2. Start subscriber
    unsubscribe = initContextEntityEnrichment();

    // 3. Write entity list without memberships
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-2' }]));

    // 4. Verify enrichment happened synchronously
    const data = queryClient.getQueryData(['organization', 'list']) as any;
    for (const item of data.pages[0].items) {
      expect(item.membership).toBeDefined();
      expect(item.membership.organizationId).toBe(item.id);
    }
  });

  it('enriches all entity lists when memberships update', () => {
    unsubscribe = initContextEntityEnrichment();

    // Pre-populate entity list
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    // Now populate memberships — should trigger enrichment of existing entity lists
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' })],
    });

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership).toBeDefined();
    expect(data.pages[0].items[0].membership.role).toBe('admin');
  });

  it('updates membership when it changes', () => {
    unsubscribe = initContextEntityEnrichment();

    // Initial memberships
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member' })],
    });

    // Entity list gets enriched
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    const before = queryClient.getQueryData(['organization', 'list']) as any;
    expect(before.pages[0].items[0].membership.role).toBe('member');

    // Membership changes
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' })],
    });

    const after = queryClient.getQueryData(['organization', 'list']) as any;
    expect(after.pages[0].items[0].membership.role).toBe('admin');
  });

  it('preserves reference when nothing changed', () => {
    const membership = makeMembership('org-1');

    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], { items: [membership] });
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    const first = queryClient.getQueryData(['organization', 'list']);

    // Re-set same memberships — should not change entity data reference
    queryClient.setQueryData(['me', 'memberships'], { items: [membership] });

    const second = queryClient.getQueryData(['organization', 'list']);
    expect(second).toBe(first);
  });

  it('uses included.membership as fallback when not in memberships cache', () => {
    unsubscribe = initContextEntityEnrichment();

    const includedMembership = makeMembership('org-fallback', { role: 'viewer' });

    // No memberships cached for this entity
    queryClient.setQueryData(['me', 'memberships'], { items: [] });

    // Entity has membership in included field
    queryClient.setQueryData(
      ['organization', 'list'],
      makeInfiniteData([{ id: 'org-fallback', included: { membership: includedMembership } } as any]),
    );

    // Trigger enrichment via memberships update (even if empty, subscriber fires on entity list update)
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('other-org')],
    });

    // The entity should still not have enrichment since the fallback
    // only provides when findMembership returns undefined and item has included.membership
    // Let's verify the subscriber picked up included.membership
    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const item = data.pages[0].items[0];
    // The subscriber should have used included.membership as fallback
    expect(item.membership).toBeDefined();
    expect(item.membership.role).toBe('viewer');
  });

  it('does not enrich non-context-entity queries', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    // A query that is NOT a context entity list
    const originalData = makeInfiniteData([{ id: 'org-1' }]);
    queryClient.setQueryData(['attachment', 'list'], originalData);

    const data = queryClient.getQueryData(['attachment', 'list']) as any;
    // Should not have been enriched
    expect(data.pages[0].items[0].membership).toBeUndefined();
  });

  it('handles entities without matching membership gracefully', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-unknown' }]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    // org-1 should be enriched
    expect(data.pages[0].items[0].membership).toBeDefined();
    // org-unknown has no membership — should remain unchanged
    expect(data.pages[0].items[1].membership).toBeUndefined();
  });
});

/**
 * Timing safety test: ensures that after ensureInfiniteQueryData + setQueryData
 * for memberships, the cache data is already enriched when read synchronously.
 * This is the critical invariant that getMenuData relies on.
 */
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
    unsubscribe = initContextEntityEnrichment();

    // Step 1: memberships are cached
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'admin' }), makeMembership('org-2', { role: 'member' })],
    });

    // Step 2: entity list is written
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }, { id: 'org-2' }]));

    // Step 3: IMMEDIATELY read from cache — must be enriched (no async gap)
    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const items = data.pages[0].items;

    expect(items).toHaveLength(2);
    expect(items[0].membership.role).toBe('admin');
    expect(items[1].membership.role).toBe('member');
  });

  it('getMenuData pattern: memberships first, then entities, then sync read', () => {
    unsubscribe = initContextEntityEnrichment();

    // Simulate the getMenuData flow:
    // 1. Memberships are cached
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-a'), makeMembership('org-b')],
    });

    // 2. Entity list is fetched/cached (ensureInfiniteQueryData)
    queryClient.setQueryData(
      ['organization', 'list'],
      makeInfiniteData([{ id: 'org-a' }, { id: 'org-b' }, { id: 'org-no-membership' }]),
    );

    // 3. Synchronous cache read must show enriched data
    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const items = data.pages[0].items;

    // Items with matching membership should be enriched
    expect(items[0].membership).toBeDefined();
    expect(items[0].membership.organizationId).toBe('org-a');

    expect(items[1].membership).toBeDefined();
    expect(items[1].membership.organizationId).toBe('org-b');

    // Items without membership should remain unenriched
    expect(items[2].membership).toBeUndefined();

    // Filtering (as getMenuData does) should yield only enriched items
    const enrichedItems = items.filter((i: any) => !!i.membership);
    expect(enrichedItems).toHaveLength(2);
  });

  it('membership update re-enriches existing entity lists synchronously', () => {
    unsubscribe = initContextEntityEnrichment();

    // Initial state
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member', archived: false })],
    });
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1' }]));

    // Verify initial enrichment
    let data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership.role).toBe('member');
    expect(data.pages[0].items[0].membership.archived).toBe(false);

    // Update membership (e.g., user archives org)
    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1', { role: 'member', archived: true })],
    });

    // Synchronous read must reflect the update
    data = queryClient.getQueryData(['organization', 'list']) as any;
    expect(data.pages[0].items[0].membership.archived).toBe(true);
  });
});

// --- Ancestor slug enrichment tests ---

describe('ancestor slug enrichment', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => {
    queryClient.clear();
  });

  afterEach(() => {
    unsubscribe?.();
    queryClient.clear();
  });

  it('enriches child entity with ancestor slug when parent is in cache', () => {
    unsubscribe = initContextEntityEnrichment();

    // Organization list with slug
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    // Memberships with organizationId for project
    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    // Project list — should get enriched with org slug
    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    const data = queryClient.getQueryData(['project', 'list']) as any;
    const item = data.pages[0].items[0];
    expect(item.ancestorSlugs).toBeDefined();
    expect(item.ancestorSlugs.organization).toBe('acme-corp');
  });

  it('does not set ancestorSlugs for root context entities', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [makeMembership('org-1')],
    });

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    const data = queryClient.getQueryData(['organization', 'list']) as any;
    const item = data.pages[0].items[0];
    // Organization has no ancestors, so ancestorSlugs should be undefined
    expect(item.ancestorSlugs).toBeUndefined();
  });

  it('falls back to ancestor ID when parent slug is not in cache, then updates when parent loads', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    // Project loaded before org — should fall back to ancestor ID
    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    let data = queryClient.getQueryData(['project', 'list']) as any;
    // Falls back to org ID when slug isn't in cache
    expect(data.pages[0].items[0].ancestorSlugs?.organization).toBe('org-1');

    // Now org loads — should trigger re-enrichment with actual slug
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    data = queryClient.getQueryData(['project', 'list']) as any;
    expect(data.pages[0].items[0].ancestorSlugs?.organization).toBe('acme-corp');
  });

  it('preserves reference when ancestor slugs have not changed', () => {
    unsubscribe = initContextEntityEnrichment();

    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    queryClient.setQueryData(['me', 'memberships'], {
      items: [
        makeMembership('org-1'),
        makeMembership('proj-1', { contextType: 'project', organizationId: 'org-1', projectId: 'proj-1' }),
      ],
    });

    queryClient.setQueryData(
      ['project', 'list'],
      makeInfiniteData([{ id: 'proj-1', slug: 'my-project', organizationId: 'org-1' } as any]),
    );

    const first = queryClient.getQueryData(['project', 'list']);

    // Re-set same org list — should not change project data reference
    queryClient.setQueryData(['organization', 'list'], makeInfiniteData([{ id: 'org-1', slug: 'acme-corp' } as any]));

    const second = queryClient.getQueryData(['project', 'list']);
    expect(second).toBe(first);
  });
});
