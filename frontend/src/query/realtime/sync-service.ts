/**
 * Sync service — runs after the app stream reaches 'live' state.
 *
 * Proactively resolves staleness for the current org (high priority) using
 * ensureQueryData/ensureInfiniteQueryData. For other orgs, leaves stale
 * queries to be resolved naturally by React Query hooks on navigation
 * (refetchOnMount: true).
 *
 * When offlineAccess is enabled, also populates offline cache for all orgs
 * to ensure data is available when the user goes offline.
 *
 * Flow:
 * 1. Wait 1s to avoid overloading server on connect
 * 2. Build menu from cache (context entities + memberships)
 * 3. High priority: ensureQueryData for current org (resolves catchup-marked staleness)
 * 4. Offline fill: ensureQueryData for remaining orgs (only when offlineAccess)
 */

import type { UserMenuItem } from '~/modules/me/types';
import { getEntitySyncQueries } from '~/offline-config';
import { queryClient } from '~/query/query-client';
import { waitFor } from '~/utils/wait-for';
import { getRouteOrgId } from './sync-priority';

/** Configuration for sync queries — extended gc time for offline caching. */
const syncQueryConfig = {
  gcTime: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * Run the sync service after the stream reaches 'live'.
 *
 * @param offlineAccess - Whether offline access is enabled (controls member inclusion + offline cache fill)
 * @param signal - AbortSignal to cancel sync (e.g., on unmount or re-trigger)
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
 * Sync a single menu item by running ensureQueryData for its entity queries.
 *
 * ensureQueryData only fetches when data is missing or stale — if catchup marked
 * the list stale (creates/updates detected), it will refetch. If the list is fresh
 * (nothing changed), it's a no-op.
 */
async function syncMenuItem(item: UserMenuItem, offlineAccess: boolean): Promise<void> {
  if (item.membership.archived) return;

  const queries = getEntitySyncQueries(item.id, item.entityType, item.tenantId, offlineAccess);

  const promises = queries.map((source) => {
    const options = { ...source, ...syncQueryConfig };
    // Use ensureInfiniteQueryData for infinite queries (have getNextPageParam)
    // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
    if ('getNextPageParam' in options) return queryClient.ensureInfiniteQueryData(options as any);
    // biome-ignore lint/suspicious/noExplicitAny: dynamic query options from getEntitySyncQueries
    return queryClient.ensureQueryData(options as any);
  });

  await Promise.allSettled(promises);
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
