import type { GetMyMembershipsResponse } from 'sdk';
import { hierarchy } from 'shared';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { queryClient } from '~/query/query-client';
import { deriveGrantBoundaryViews } from '~/query/realtime/views';
import { syncStore } from './sync-store';

/** Sub-organization channel types: every channel below the root carries a server-computed `path`. */
const nestedChannelTypes = hierarchy.channelTypes.filter((type) => hierarchy.getParent(type) !== null);

/**
 * Root-first id path of a cached channel row, or null when uncached; the engine then keeps the
 * organization-wide view, so this is precision, never a correctness dependency. `channelType` is null
 * when the caller knows only the id, as in the fetch prioritizer's covering-prefix computation; every
 * nested channel type is searched then. Cella's single-channel hierarchy has no nested types.
 */
export function resolveChannelPath(channelType: string | null, channelId: string): string | null {
  const types = channelType ? [channelType] : nestedChannelTypes;
  for (const type of types) {
    const row = findInCache<{ id: string; path?: string | null }>(type, channelId);
    if (row?.path) return row.path;
  }
  return null;
}

/** Rebuilt from the membership cache before each catchup request: built-in org views absorb equivalent derived views, and a disappeared grant removes its own. */
export function declareViewsFromMemberships(): void {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  const memberships = data?.items ?? [];
  const entityTypes = getRegisteredProductEntityTypes();

  const derived = deriveGrantBoundaryViews({
    memberships,
    entityTypes,
    resolvePath: resolveChannelPath,
  });

  const store = syncStore.getState();
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

  for (const key of Object.keys(syncStore.getState().views)) {
    if (!keep.has(key)) store.removeSyncView(key);
  }

  // Stored orgs the caller is no longer (or never was) a member of: prune them, or they accumulate
  // forever in the persisted store; every dead org costs one view per entity type in each catchup
  // body until the request overflows the server's views cap and catchup fails outright. Only prune
  // against a loaded membership cache; `data` undefined just means memberships have not arrived yet.
  if (data) {
    const memberOrgIds = new Set(memberships.map((m) => m.organizationId));
    for (const orgId of Object.keys(syncStore.getState().orgs)) {
      if (!memberOrgIds.has(orgId)) store.removeOrg(orgId);
    }
  }
}
