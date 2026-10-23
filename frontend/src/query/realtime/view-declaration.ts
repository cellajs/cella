import type { GetMyMembershipsResponse } from 'sdk';
import { hierarchy } from 'shared';
import { meKeys } from '~/modules/me/query';
import { getRegisteredProductEntityTypes } from '~/query/basic/entity-query-registry';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { queryClient } from '~/query/query-client';
import { syncStore } from '~/query/realtime/sync-store';
import { deriveGrantBoundaryViews } from '~/query/realtime/views';

/** Sub-organization channel types: every channel below the organization carries a server-computed `path`. */
const nestedChannelTypes = hierarchy.channelTypes.filter((type) => hierarchy.getParent(type) !== null);

/**
 * Root-first id path of a cached channel row, or null when uncached: the engine then keeps the organization-wide view, so
 * this adds precision, never correctness. A null `channelType` (the caller knows only the id) searches every nested type.
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
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(meKeys.memberships);
  const memberships = data?.items ?? [];
  const entityTypes = getRegisteredProductEntityTypes();

  const derived = deriveGrantBoundaryViews({ memberships, entityTypes, resolvePath: resolveChannelPath });

  const store = syncStore.getState();
  const declaredKeys = new Set<string>();
  for (const { key, ...view } of derived) {
    // Exact org-subtree views duplicate the built-in org-view baseline.
    if (view.depth === 'subtree' && view.prefixes.length === 1 && view.prefixes[0] === view.organizationId) continue;
    declaredKeys.add(key);
    store.declareSyncView(key, view);
  }

  for (const key of Object.keys(syncStore.getState().views)) {
    if (!declaredKeys.has(key)) store.removeSyncView(key);
  }

  // Prune stored orgs the caller is not a member of, but only against a loaded cache: `data` is undefined until memberships arrive.
  if (data) {
    const memberOrganizationIds = new Set(memberships.map((membership) => membership.organizationId));
    for (const organizationId of Object.keys(syncStore.getState().orgs)) {
      if (!memberOrganizationIds.has(organizationId)) store.removeOrg(organizationId);
    }
    // An organization the store has not seen gets its entry here, so the catchup that follows declares its views and stores their baselines on a client's first connection.
    for (const { organizationId, tenantId } of memberships) {
      if (!syncStore.getState().orgs[organizationId]) store.trackOrg(organizationId, tenantId);
    }
  }
}
