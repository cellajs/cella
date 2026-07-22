import { buildEntitySyncQueries } from '~/list-queries-config';
import type { UserMenuItem } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { waitFor } from '~/utils/wait-for';
import { getRouteOrgId } from './sync-priority';

// Extended gc time for offline caching. staleTime is intentionally not set; product entity
// queries use syncStaleTime from their own options (Infinity when stream is live, 5 min fallback)
// so ensureQueryData skips fresh caches after catchup.
const syncQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Resolve current-organization staleness once the stream is live; optionally fill other offline caches.
 * Cancel on unmount or retrigger through `signal`.
 */
export async function runSyncService(offlineAccess: boolean, signal: AbortSignal): Promise<void> {
  // Wait briefly to avoid overloading server on connect
  await waitFor(1000);
  if (signal.aborted) return;

  // Get menu from already-cached entity lists (dynamic import to avoid HMR coupling)
  const { getMenuData } = await import('~/modules/navigation/menu-sheet/helpers/get-menu-data');
  const menu = await getMenuData();
  if (signal.aborted) return;

  // Flatten menu items for processing
  const allItems = flattenMenuItems(menu);
  if (allItems.length === 0) return;

  // Determine current org for priority routing
  const routeOrgId = getRouteOrgId();

  // Split into high priority (current org) and low priority (other orgs)
  const highPriority = allItems.filter((item) => item.organizationId === routeOrgId || item.id === routeOrgId);
  const lowPriority = allItems.filter((item) => item.organizationId !== routeOrgId && item.id !== routeOrgId);

  // High priority: resolve staleness for current org immediately
  for (const item of highPriority) {
    if (signal.aborted) return;
    await syncMenuItem(item, offlineAccess);
  }

  // Low priority: only fill offline cache when offlineAccess is enabled
  // Otherwise, React Query hooks handle refetches on navigation (refetchOnMount: true)
  if (offlineAccess) {
    for (const item of lowPriority) {
      if (signal.aborted) return;
      await waitFor(500); // Stagger requests to avoid server overload
      await syncMenuItem(item, offlineAccess);
    }
  }

  console.debug(
    `[SyncService] Complete: ${highPriority.length} high-priority, ${offlineAccess ? lowPriority.length : 0} low-priority`,
  );
}

/**
 * Sync a single menu item via ensureQueryData for its entity queries: refetches only when catchup
 * marked the list stale (creates/updates), no-op when the list is still fresh.
 */
async function syncMenuItem(item: UserMenuItem, offlineAccess: boolean): Promise<void> {
  if (item.membership.archived) return;

  // For organizations, the entity IS the org. For sub-contexts, organizationId comes from enrichment.
  const organizationId = item.entityType === 'organization' ? item.id : (item.organizationId ?? '');
  const queries = buildEntitySyncQueries({
    targetEntityId: item.id,
    targetEntityType: item.entityType,
    tenantId: item.tenantId,
    currentOrganizationId: organizationId,
    includeMemberQueries: offlineAccess,
  });

  await Promise.allSettled(
    queries.map(async (source) => {
      const options = { ...source, ...syncQueryConfig };
      const isInfinite = 'getNextPageParam' in options;
      return isInfinite
        ? // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.ensureInfiniteQueryData(options as any)
        : // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.ensureQueryData(options as any);
    }),
  );
}

/**
 * Flatten hierarchical menu structure into a flat array of items.
 * Processes parent items first, then recursively processes submenu items.
 */
function flattenMenuItems(menu: Record<string, UserMenuItem[]>): UserMenuItem[] {
  const items: UserMenuItem[] = [];

  function collect(menuItems: UserMenuItem[]) {
    for (const item of menuItems) {
      items.push(item);
      if (item.submenu) collect(item.submenu);
    }
  }

  for (const section of Object.values(menu)) {
    collect(section);
  }

  return items;
}
