import type { GetMyMembershipsResponse } from 'sdk';
import { isProduct } from 'shared';
import { queryClient } from '~/query/query-client';
import { isObservedChannel } from '~/query/realtime/observed-channels';
import { syncStore } from '~/query/realtime/sync-store';
import { getRouter } from '~/routes/-router-instance';

/** Null outside an org layout. */
export function getRouteOrgId(): string | null {
  for (const match of getRouter().state.matches) {
    const ctx = match.context;
    if (ctx && 'organization' in ctx && ctx.organization) {
      return (ctx.organization as { id: string }).id;
    }
  }
  return null;
}

/** Null outside an org layout. */
export function getRouteTenantId(): string | null {
  for (const match of getRouter().state.matches) {
    const ctx = match.context;
    if (ctx && 'tenantId' in ctx && typeof ctx.tenantId === 'string') {
      return ctx.tenantId;
    }
  }
  return null;
}

type OrgTenantIdSource = { organizationId?: string | null; tenantId?: string | null };

/** Prefers query meta, then cached entity fields, then the current route. */
export function resolveQueryOrgTenantIds(
  meta: OrgTenantIdSource | undefined,
  cached: OrgTenantIdSource | undefined,
  resource: string,
): { organizationId: string; tenantId: string } {
  const organizationId = meta?.organizationId ?? cached?.organizationId ?? getRouteOrgId();
  const tenantId = meta?.tenantId ?? cached?.tenantId ?? getRouteTenantId();
  if (!organizationId || !tenantId) {
    throw new Error(`Cannot resolve organizationId/tenantId for ${resource} fetch`);
  }
  return { organizationId, tenantId };
}

export function getTenantIdForOrg(organizationId: string): string | null {
  // The sync store is persisted, so it answers before query cache hydration.
  const fromStore = syncStore.getState().getOrgTenantId(organizationId);
  if (fromStore) return fromStore;

  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  if (!data?.items) return null;
  const membership = data.items.find((m) => m.organizationId === organizationId);
  return membership?.tenantId ?? null;
}

/** How soon this client wants a channel view's changes: the fetch prioritizer clamps the server-spread delay between `min` (0 is live) and `max`. `Infinity` means fetch on open only. */
export interface SyncTier {
  min: number;
  max: number;
}

const TIER_VIEWING: SyncTier = { min: 0, max: 0 };
const TIER_BACKGROUND: SyncTier = { min: 2_000, max: 30_000 };
const TIER_ON_OPEN: SyncTier = { min: Number.POSITIVE_INFINITY, max: Number.POSITIVE_INFINITY };

/** Same org, and for sub-org channel views a mounted view observes a query carrying the channel id, which covers slug routes and boards whose routes do not name every rendered channel. */
export function isViewingChannel(organizationId: string, channelId: string | null): boolean {
  const routeOrgId = getRouteOrgId();
  if (!routeOrgId || routeOrgId !== organizationId) return false;
  if (!channelId || channelId === organizationId) return true;
  return isObservedChannel(channelId);
}

/** Membership `muted`/`archived` = the user declared "not urgent" for this scope. */
function isMutedOrArchived(organizationId: string, channelId: string | null): boolean {
  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  if (!data?.items) return false;
  const targetId = channelId ?? organizationId;
  const membership = data.items.find((m) => m.channelId === targetId);
  return membership ? membership.muted || membership.archived : false;
}

/** Set the sole sync priority: viewed scopes live, muted scopes on open, and others in background. */
export function getSyncTier(entityType: string, organizationId: string, channelId: string | null): SyncTier {
  if (!isProduct(entityType)) return TIER_ON_OPEN;
  if (isViewingChannel(organizationId, channelId)) return TIER_VIEWING;
  if (isMutedOrArchived(organizationId, channelId)) return TIER_ON_OPEN;
  return TIER_BACKGROUND;
}
