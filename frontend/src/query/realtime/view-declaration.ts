import type { GetMyMembershipsResponse } from 'sdk';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { queryClient } from '~/query/query-client';
import { deriveGrantBoundaryViews } from '~/query/realtime/views';
import { useSyncStore } from './sync-store';

/**
 * Resolve cached sub-organization channel paths through a fork registration.
 * Unknown paths skip precise grant views while organization baselines retain coverage.
 */
let channelPathResolver: (channelType: string | null, channelId: string) => string | null = () => null;

export function registerChannelPathResolver(
  resolver: (channelType: string | null, channelId: string) => string | null,
): void {
  channelPathResolver = resolver;
}

/**
 * Resolve a channel's canonical path via the registered resolver. `channelType` is null when
 * the caller only knows the id (the fetch prioritizer's covering-prefix computation); fork resolvers
 * then search their cached channel types.
 */
export function resolveChannelPath(channelType: string | null, channelId: string): string | null {
  return channelPathResolver(channelType, channelId);
}

/**
 * Rebuilds grant-boundary views from current membership cache before each catchup request.
 * Built-in organization views absorb equivalent derived views; disappeared grants remove theirs.
 */
export function declareViewsFromMemberships(): void {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  const memberships = data?.items ?? [];
  const entityTypes = getRegisteredProductEntityTypes();

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
