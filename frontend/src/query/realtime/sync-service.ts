import type { FetchInfiniteQueryOptions, FetchQueryOptions, QueryKey } from '@tanstack/react-query';
import { buildEntitySyncQueries } from '~/entity-sync-queries';
import type { ApiError } from '~/lib/api';
import type { UserMenuItem } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { getRouteOrganizationId } from '~/query/realtime/sync-priority';
import { waitFor } from '~/utils/wait-for';

type SyncInfiniteCall = FetchInfiniteQueryOptions<unknown, ApiError, unknown, QueryKey, unknown>;
type SyncSingleCall = FetchQueryOptions<unknown, ApiError, unknown, QueryKey>;

const isInfiniteCall = (options: SyncInfiniteCall | SyncSingleCall): options is SyncInfiniteCall => 'getNextPageParam' in options;

/** Seeds offline caches once the stream is live: the current organization first, then the rest. `signal` cancels on unmount or retrigger. */
export async function runSyncService(signal: AbortSignal): Promise<void> {
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
    await syncMenuItem(item);
  }

  for (const item of lowPriority) {
    if (signal.aborted) return;
    // Staggered, so the background seeding does not burst the server.
    await waitFor(500);
    await syncMenuItem(item);
  }

  console.debug(`[SyncService] Complete: ${highPriority.length} high-priority, ${lowPriority.length} low-priority`);
}

/**
 * Seeds the offline cache for one menu item. `staleTime: 'static'` fetches a cold entry and leaves a cached one
 * alone whatever its age or invalidation state, because freshness here is the sync engine's job: catchup patches
 * these lists from CDC deltas, and a full list GET would race that work.
 */
async function syncMenuItem(item: UserMenuItem): Promise<void> {
  if (item.membership.archived) return;

  // For an organization the entity is the org itself; a channel below it gets organizationId from enrichment.
  const organizationId = item.entityType === 'organization' ? item.id : (item.organizationId ?? '');
  const queries = buildEntitySyncQueries({
    targetEntityId: item.id,
    targetEntityType: item.entityType,
    tenantId: item.tenantId,
    currentOrganizationId: organizationId,
  });

  await Promise.allSettled(
    queries.map(async (source) => {
      // The queries differ in key and data types, which no single options type holds: one cast to the call shapes, the `in` check picks the call.
      const cacheFirst = { ...source, staleTime: 'static' } as SyncInfiniteCall | SyncSingleCall;
      return isInfiniteCall(cacheFirst) ? await queryClient.infiniteQuery(cacheFirst) : await queryClient.query(cacheFirst);
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
