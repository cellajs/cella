import type { ListMyMembershipsResponse } from 'sdk';
import { hierarchy } from 'shared';
import { meKeys } from '~/modules/me/query';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { queryClient } from '~/query/query-client';
import { syncStore } from '~/query/realtime/sync-store';

/** Sub-organization channel types: every channel below the organization carries a server-computed `path`. */
const nestedChannelTypes = hierarchy.channelTypes.filter((type) => hierarchy.getParent(type) !== null);

/** Root-first id path of a cached channel row of any nested type, or null when uncached. */
export function resolveChannelPath(channelId: string): string | null {
  for (const type of nestedChannelTypes) {
    const row = findInCache<{ id: string; path?: string | null }>(type, channelId);
    if (row?.path) return row.path;
  }
  return null;
}

/** Matches the stored organizations to the membership cache before each catchup request: the catchup declares a view per stored organization and type. */
export function declareViewsFromMemberships(): void {
  const data = queryClient.getQueryData<ListMyMembershipsResponse>(meKeys.memberships);
  // Prune stored orgs the caller is not a member of, but only against a loaded cache: `data` is undefined until memberships arrive.
  if (!data) return;

  const store = syncStore.getState();
  const memberOrganizationIds = new Set(data.results.map((membership) => membership.organizationId));
  for (const organizationId of Object.keys(syncStore.getState().orgs)) {
    if (!memberOrganizationIds.has(organizationId)) store.removeOrg(organizationId);
  }
  // An organization the store has not seen gets its entry here, so the catchup that follows declares its views and stores their baselines on a client's first connection.
  for (const organizationId of memberOrganizationIds) if (!syncStore.getState().orgs[organizationId]) store.trackOrg(organizationId);
}
