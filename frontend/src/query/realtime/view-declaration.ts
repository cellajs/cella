import type { GetMyMembershipsResponse } from 'sdk';
import { getRegisteredEntityTypes, hasEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { deriveGrantBoundaryViews } from '~/query/realtime/views';
import { useSyncStore } from './sync-store';

/**
 * Canonical path lookup for sub-org channels, from cached channel data. The template's only
 * channel is the organization (root, path = org id), so the default resolver knows nothing;
 * forks with deeper hierarchies register one that reads `path` off their cached channel rows.
 * An unresolved path skips that grant's view; the org-view baseline still covers the rows.
 */
let channelPathResolver: (channelType: string | null, channelId: string) => string | null = () => null;

export function registerChannelPathResolver(
  resolver: (channelType: string | null, channelId: string) => string | null,
): void {
  channelPathResolver = resolver;
}

/**
 * Resolve a channel's canonical path via the registered resolver. `channelType` is null when
 * the caller only knows the id (the scheduler's covering-prefix computation); fork resolvers
 * then search their cached channel types.
 */
export function resolveChannelPath(channelType: string | null, channelId: string): string | null {
  return channelPathResolver(channelType, channelId);
}

/**
 * Declare grant-boundary views from the cached memberships (runs right before each catchup
 * request is built; catchup is the only consumer of the view registry, so deriving at that
 * moment is always fresh, and `declareSyncView`'s re-baseline rule fires exactly when a grant
 * set changed while offline).
 *
 * Precision on top of the baseline: a derived view that is exactly the org subtree is NOT
 * declared; the built-in org view per (org, entityType) already covers it, which keeps the
 * template's catchup requests byte-identical to before (org-homed products derive only
 * org-wide views). Views for grants that disappeared are removed.
 */
export function declareViewsFromMemberships(): void {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  const memberships = data?.items ?? [];
  const entityTypes = getRegisteredEntityTypes().filter((entityType) => hasEntityQueryKeys(entityType));

  const derived = deriveGrantBoundaryViews({
    memberships,
    entityTypes,
    resolvePath: (channelType, channelId) => channelPathResolver(channelType, channelId),
  });

  const store = useSyncStore.getState();
  const keep = new Set<string>();
  for (const view of derived) {
    // Exact org-subtree views duplicate the built-in org-view baseline.
    if (view.depth === 'subtree' && view.prefixes.length === 1 && view.prefixes[0] === view.organizationId) continue;
    keep.add(view.key);
    store.declareSyncView(view.key, {
      organizationId: view.organizationId,
      prefixes: view.prefixes,
      entityTypes: view.entityTypes,
      depth: view.depth,
    });
  }

  for (const key of Object.keys(useSyncStore.getState().views)) {
    if (!keep.has(key)) store.removeSyncView(key);
  }
}
