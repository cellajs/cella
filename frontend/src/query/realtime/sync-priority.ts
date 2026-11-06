import type { ListMyMembershipsResponse } from 'sdk';
import { meKeys } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { isObservedChannel } from '~/query/realtime/observed-channels';
import { getRouter } from '~/routes/-router-instance';

/** Null outside an org layout. */
export function getRouteOrganizationId(): string | null {
  for (const match of getRouter().state.matches) {
    const context = match.context;
    if (context && 'organization' in context && context.organization) {
      return context.organization.id;
    }
  }
  return null;
}

/** Null outside an org layout. */
function getRouteTenantId(): string | null {
  for (const match of getRouter().state.matches) {
    const context = match.context;
    if (context && 'tenantId' in context) {
      return context.tenantId;
    }
  }
  return null;
}

type OrgTenantIdSource = { organizationId?: string | null; tenantId?: string | null };

/** Prefers cached entity fields, then the current route. */
export function resolveQueryOrgTenantIds(cached: OrgTenantIdSource | undefined, resource: string): { organizationId: string; tenantId: string } {
  const organizationId = cached?.organizationId ?? getRouteOrganizationId();
  const tenantId = cached?.tenantId ?? getRouteTenantId();
  if (!organizationId || !tenantId) {
    throw new Error(`Cannot resolve organizationId/tenantId for ${resource} fetch`);
  }
  return { organizationId, tenantId };
}

/** The tenant of an organization the user belongs to, from the cached memberships; null before they load. */
export function getTenantIdForOrg(organizationId: string): string | null {
  const data = queryClient.getQueryData<ListMyMembershipsResponse>(meKeys.memberships);
  return data?.results.find((item) => item.organizationId === organizationId)?.tenantId ?? null;
}

/** How soon this client wants a channel view's changes: the fetch prioritizer clamps the server-spread delay between `min` (0 is live) and `max`. `Infinity` means fetch on open only. */
export interface SyncTier {
  min: number;
  max: number;
}

const tierViewing: SyncTier = { min: 0, max: 0 };
export const tierBackground: SyncTier = { min: 2_000, max: 30_000 };
const tierOnOpen: SyncTier = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };

/** Same org, and for sub-org channel views a mounted view observes a query carrying the channel id, which covers slug routes and boards whose routes do not name every rendered channel. */
export function isViewingChannel(organizationId: string, channelId: string | null): boolean {
  const routeOrganizationId = getRouteOrganizationId();
  if (!routeOrganizationId || routeOrganizationId !== organizationId) return false;
  if (!channelId || channelId === organizationId) return true;
  return isObservedChannel(channelId);
}

/** Membership `muted`/`archived` = the user declared "not urgent" for this scope. */
function isMutedOrArchived(organizationId: string, channelId: string | null): boolean {
  const data = queryClient.getQueryData<ListMyMembershipsResponse>(meKeys.memberships);
  if (!data?.results) return false;
  const targetId = channelId ?? organizationId;
  const membership = data.results.find((item) => item.channelId === targetId);
  return membership ? membership.muted || membership.archived : false;
}

/** The one sync priority: viewed scopes live, muted scopes on open, the others in the background. */
export function getSyncTier(organizationId: string, channelId: string | null): SyncTier {
  if (isViewingChannel(organizationId, channelId)) return tierViewing;
  if (isMutedOrArchived(organizationId, channelId)) return tierOnOpen;
  return tierBackground;
}
