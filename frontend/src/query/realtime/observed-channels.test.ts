import { QueryObserver } from '@tanstack/react-query';
import type { EntityType } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '~/query/tests/query-client-env';

// Synthetic sub-org hierarchy (real builder instance) because base cella has no sub-org
// channels. Task is a product homed at the `project` channel under `organization`.
vi.mock('shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('shared')>();
  const roles = actual.createRoleRegistry(['member'] as const);
  const hierarchy = actual
    .createEntityHierarchy(roles)
    .user()
    .organization({ roles: roles.all })
    .channel('project', { parent: 'organization', roles: roles.all })
    .product('task', { parent: 'project' })
    .build();
  return {
    ...actual,
    appConfig: { slug: 'test', channelEntityTypes: hierarchy.channelTypes, entityIdColumnKeys: hierarchy.idColumnKeys, seenTrackedProductTypes: [] },
    hierarchy,
    isChannel: hierarchy.isChannel,
    isProduct: hierarchy.isProduct,
  };
});

// Sub-org channels are absent from the route context, so viewing detection uses the query cache.
let routeMatches: { context?: Record<string, unknown> }[] = [];
vi.mock('~/routes/-router-instance', () => ({
  getRouter: () => ({ state: { matches: routeMatches } }),
}));

stubLocalStorage();

const { createEntityKeys } = await import('~/query/basic/create-query-keys');
const { registerEntityQueryKeys } = await import('~/query/basic/entity-query-registry');
const { queryClient } = await import('~/query/query-client');
const { isObservedChannel } = await import('~/query/realtime/observed-channels');
const { isViewingChannel } = await import('~/query/realtime/sync-priority');

// The synthetic 'task' type exists only in this file's shared mock, hence the casts.
const task = 'task' as EntityType;
const taskKeys = createEntityKeys(task);
registerEntityQueryKeys(task, taskKeys);

/** Mount a headless observer matching the signal produced by a component rendering this query. */
function observe(queryKey: readonly unknown[]): () => void {
  const observer = new QueryObserver(queryClient, { queryKey: [...queryKey], queryFn: async () => [] });
  return observer.subscribe(() => {});
}

describe('observed-channels', () => {
  afterEach(() => {
    queryClient.clear();
    vi.clearAllMocks();
  });

  it('finds the channel id inside filter-object keys', () => {
    const unsubscribe = observe(['task', 'list', { projectId: 'project-3', q: 'search' }]);
    expect(isObservedChannel('project-3')).toBe(true);
    expect(isObservedChannel('project-elsewhere')).toBe(false);

    unsubscribe();
  });
});

describe('isViewingChannel with sub-org channels', () => {
  afterEach(() => {
    queryClient.clear();
    routeMatches = [];
  });

  it('resolves sub-org channel views by observation: slug routes and unrouted board panels both work', () => {
    routeMatches = [{ context: { organization: { id: 'org-1' } } }]; // Slug routes and boards name no project.
    expect(isViewingChannel('org-1', 'project-8')).toBe(false);

    const unsubscribe = observe(taskKeys.list.home('org-1', 'project-8'));
    expect(isViewingChannel('org-1', 'project-8')).toBe(true);

    unsubscribe();
    expect(isViewingChannel('org-1', 'project-8')).toBe(false);
  });
});
