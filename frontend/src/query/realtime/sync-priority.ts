import type { GetMyMembershipsResponse } from 'sdk';
import { hierarchy, type ProductEntityType } from 'shared';
import { queryClient } from '~/query/query-client';
import { useSyncStore } from '~/query/realtime/sync-store';
import { router } from '~/routes/router';

type SyncPriority = 'high' | 'medium' | 'low';

interface SyncNotification {
  entityType: ProductEntityType;
  entityId: string;
  organizationId: string | null;
}

/** Get the current org ID from the router's matched route context, if user is within an org layout. */
export function getRouteOrgId(): string | null {
  for (const match of router.state.matches) {
    const ctx = match.context;
    if (ctx && 'organization' in ctx && ctx.organization) {
      return (ctx.organization as { id: string }).id;
    }
  }
  return null;
}

/** Get the current tenant ID from the router's matched route context, if user is within an org layout. */
export function getRouteTenantId(): string | null {
  for (const match of router.state.matches) {
    const ctx = match.context;
    if (ctx && 'tenantId' in ctx && typeof ctx.tenantId === 'string') {
      return ctx.tenantId;
    }
  }
  return null;
}

/** Resolve tenantId for an organizationId. Checks sync store first (persisted, instant), then query cache. */
export function getTenantIdForOrg(organizationId: string): string | null {
  // Sync store is persisted to localStorage, available before query cache hydration.
  const fromStore = useSyncStore.getState().getOrgTenantId(organizationId);
  if (fromStore) return fromStore;

  const data = queryClient.getQueryData<GetMyMembershipsResponse>(['me', 'memberships']);
  if (!data?.items) return null;
  const membership = data.items.find((m) => m.organizationId === organizationId);
  return membership?.tenantId ?? null;
}

/**
 * Sync priority by current route: high when the user is viewing the org that scopes this entity,
 * low otherwise (different org, not in an org route, non-product entity).
 */
export function getSyncPriority(notification: SyncNotification): SyncPriority {
  const { entityType, organizationId } = notification;

  // Only product entities have sync priority logic
  if (!hierarchy.isProduct(entityType)) return 'low';

  const routeOrgId = getRouteOrgId();

  // Not in an org route -> low priority
  if (!routeOrgId) return 'low';

  // Different org -> low priority
  if (organizationId && routeOrgId !== organizationId) return 'low';

  // User is in matching org context
  return 'high';
}
