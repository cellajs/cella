import { buildEntitySyncQueries } from '~/entity-sync-queries';
import type { UserMenuItem } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { getRouteOrganizationId } from '~/query/realtime/sync-priority';
import { waitFor } from '~/utils/wait-for';

/** Seeds offline caches once the stream is live: the current organization first, then the rest when offline access is on. `signal` cancels on unmount or retrigger. */
export async function runSyncService(offlineAccess: boolean, signal: AbortSignal): Promise<void> {
  // Starts a second after the stream went live, behind the requests of the page itself.
  await waitFor(1000);
  if (signal.aborted) return;

  // Menu comes from already-cached entity lists; imported dynamically to avoid HMR coupling.
  const { getMenuData } = await import('~/modules/navigation/menu-sheet/helpers/get-menu-data');
  const menu = await getMenuData();
  if (signal.aborted) return;

  const allItems = flattenMenuItems(menu);
  if (allItems.length === 0) return;

  const routeOrganizationId = getRouteOrganizationId();

  const highPriority = allItems.filter((item) => item.organizationId === routeOrganizationId || item.id === routeOrganizationId);
  const lowPriority = allItems.filter((item) => item.organizationId !== routeOrganizationId && item.id !== routeOrganizationId);

  for (const item of highPriority) {
    if (signal.aborted) return;
    await syncMenuItem(item, offlineAccess);
  }

  // Without offlineAccess, React Query hooks refetch other orgs on navigation.
  if (offlineAccess) {
    for (const item of lowPriority) {
      if (signal.aborted) return;
      // Staggered, so the background seeding does not burst the server.
      await waitFor(500);
      await syncMenuItem(item, offlineAccess);
    }
  }

  const lowPriorityCount = offlineAccess ? lowPriority.length : 0;
  console.debug(`[SyncService] Complete: ${highPriority.length} high-priority, ${lowPriorityCount} low-priority`);
}

/**
 * Seeds the offline cache for one menu item. `staleTime: 'static'` fetches a cold entry and leaves a cached one
 * alone whatever its age or invalidation state, because freshness here is the sync engine's job: catchup patches
 * these lists from CDC deltas, and a full list GET would race that work.
 */
async function syncMenuItem(item: UserMenuItem, offlineAccess: boolean): Promise<void> {
  if (item.membership.archived) return;

  // For an organization the entity is the org itself; a channel below it gets organizationId from enrichment.
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
      const isInfinite = 'getNextPageParam' in source;
      const cacheFirst = { ...source, staleTime: 'static' };
      return isInfinite
        ? // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.infiniteQuery(cacheFirst as any)
        : // biome-ignore lint/suspicious/noExplicitAny: runtime check narrows type but TS can't infer it
          await queryClient.query(cacheFirst as any);
    }),
  );
}

/** Parent items come before their submenu items. */
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
