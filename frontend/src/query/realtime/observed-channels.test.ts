import { QueryObserver } from '@tanstack/react-query';
import type { EntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Synthetic sub-org topology because base cella has no sub-org channels.
// Task is a product homed at the `project` channel under `organization`.
vi.mock('shared', () => ({
  appConfig: {
    slug: 'test',
    channelEntityTypes: ['organization', 'project'],
    entityIdColumnKeys: { organization: 'organizationId', project: 'projectId', task: 'taskId' },
    seenTrackedEntityTypes: [],
  },
  hierarchy: {
    getOrderedAncestors: (entityType: string) => {
      if (entityType === 'task') return ['project', 'organization'];
      return ['organization'];
    },
    getParent: () => null,
    isProduct: (entityType: string) => entityType === 'task',
  },
}));

// Sub-org channels are absent from the route context, so viewing detection uses the query cache.
let routeMatches: { context?: Record<string, unknown> }[] = [];
vi.mock('~/routes/-router-instance', () => ({
  getRouter: () => ({ state: { matches: routeMatches } }),
}));

// query-client attaches online/offline listeners at module load.
vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
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
const { isObservedChannel } = await import('./observed-channels');
const { isViewingChannel } = await import('./sync-priority');

// The synthetic 'task' type exists only in this file's shared mock, hence the casts.
const TASK = 'task' as EntityType;
const taskKeys = createEntityKeys(TASK);
registerEntityQueryKeys(TASK, taskKeys);

/** Mount a headless observer matching the signal produced by a component rendering this query. */
function observe(queryKey: readonly unknown[]): () => void {
  const observer = new QueryObserver(queryClient, {
    queryKey: [...queryKey],
    queryFn: async () => [],
  });
  return observer.subscribe(() => {});
}

describe('observed-channels', () => {
  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('marks a channel observed while its canonical scope query has an observer, and clears on unsubscribe', () => {
    expect(isObservedChannel('project-1')).toBe(false);

    const unsubscribe = observe(taskKeys.list.home('org-1', 'project-1'));
    expect(isObservedChannel('project-1')).toBe(true);

    unsubscribe();
    expect(isObservedChannel('project-1')).toBe(false);
  });

  it('does not count cached data without observers (prefetching sibling channels stays background)', () => {
    queryClient.setQueryData([...taskKeys.list.home('org-1', 'project-2')], []);
    expect(isObservedChannel('project-2')).toBe(false);
  });

  it('finds the channel id inside filter-object keys', () => {
    const unsubscribe = observe(['task', 'list', { projectId: 'project-3', q: 'search' }]);
    expect(isObservedChannel('project-3')).toBe(true);
    expect(isObservedChannel('project-elsewhere')).toBe(false);

    unsubscribe();
  });

  it('keeps a channel observed while any of its queries still has an observer', () => {
    const first = observe(taskKeys.list.home('org-1', 'project-4'));
    const second = observe(['task', 'list', { projectId: 'project-4' }]);

    first();
    expect(isObservedChannel('project-4')).toBe(true);

    second();
    expect(isObservedChannel('project-4')).toBe(false);
  });

  it('ignores detail keys and unregistered entity types', () => {
    const detail = observe(taskKeys.detail.byId('project-5')); // id happens to collide with a channel id
    const foreign = observe(['unregistered', 'list', 'org-1', 'project-5']);

    expect(isObservedChannel('project-5')).toBe(false);

    detail();
    foreign();
  });
});

describe('isViewingChannel with sub-org channels', () => {
  afterEach(() => {
    queryClient.clear();
    routeMatches = [];
  });

  it('requires the route org to match, regardless of observation', () => {
    routeMatches = [{ context: { organization: { id: 'org-1' } } }];
    const unsubscribe = observe(taskKeys.list.home('org-2', 'project-7'));

    expect(isViewingChannel('org-2', 'project-7')).toBe(false);

    unsubscribe();
  });

  it('treats org-level scopes as viewed inside the org (base cella behavior unchanged)', () => {
    routeMatches = [{ context: { organization: { id: 'org-1' } } }];
    expect(isViewingChannel('org-1', null)).toBe(true);
    expect(isViewingChannel('org-1', 'org-1')).toBe(true);
  });

  it('resolves sub-org scopes by observation: slug routes and unrouted board panels both work', () => {
    routeMatches = [{ context: { organization: { id: 'org-1' } } }]; // Slug routes and boards name no project.
    expect(isViewingChannel('org-1', 'project-8')).toBe(false);

    const unsubscribe = observe(taskKeys.list.home('org-1', 'project-8'));
    expect(isViewingChannel('org-1', 'project-8')).toBe(true);

    unsubscribe();
    expect(isViewingChannel('org-1', 'project-8')).toBe(false);
  });
});
